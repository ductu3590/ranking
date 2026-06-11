/**
 * Transaction Parser Module - Reverse Lookup Strategy
 * 
 * Strategy: Instead of parsing bank format, we normalize the content
 * and scan for member keywords
 * 
 * Steps:
 * 1. Normalize input (uppercase, remove Vietnamese marks, remove special chars)
 * 2. Load member keyword list from database
 * 3. Scan normalized text for keyword matches (prioritize longer keywords)
 */

import { supabaseServer } from './supabaseServer';

// ============================================================
// TEXT NORMALIZATION
// ============================================================

/**
 * Remove Vietnamese diacritics (tone marks)
 */
function removeDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize text for matching
 * - Convert to uppercase
 * - Remove Vietnamese diacritics
 * - Remove special characters (keep letters, numbers, spaces)
 */
function normalizeText(text) {
  if (!text) return '';

  return removeDiacritics(text)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ') // Remove special chars, keep spaces
    .replace(/\s+/g, ' ')          // Normalize spaces
    .trim();
}

/**
 * Normalize text for substring matching (remove all spaces)
 */
function normalizeForMatching(text) {
  return normalizeText(text).replace(/\s+/g, ''); // Remove ALL spaces
}

// ============================================================
// MEMBER KEYWORD MATCHING
// ============================================================

/**
 * Load members with their keywords from database
 */
async function loadMemberKeywords() {
  try {
    const { data: members, error } = await supabaseServer
      .from('club_members')
      .select('full_name, aliases')
      .eq('is_active', true);

    if (error || !members) {
      console.error('Error loading members:', error);
      return [];
    }

    // Build keyword list with member associations
    const keywordList = [];

    for (const member of members) {
      // Add full name as primary keyword
      const normalizedFullName = normalizeForMatching(member.full_name);
      keywordList.push({
        keyword: normalizedFullName,
        memberName: member.full_name,
        priority: normalizedFullName.length, // Longer = higher priority
        type: 'full_name'
      });

      // Add aliases
      if (member.aliases && Array.isArray(member.aliases)) {
        for (const alias of member.aliases) {
          const normalizedAlias = normalizeForMatching(alias);
          if (normalizedAlias) {
            keywordList.push({
              keyword: normalizedAlias,
              memberName: member.full_name,
              priority: normalizedAlias.length,
              type: 'alias'
            });
          }
        }
      }
    }

    // Sort by priority (longer keywords first)
    keywordList.sort((a, b) => b.priority - a.priority);

    return keywordList;
  } catch (error) {
    console.error('Error loading member keywords:', error);
    return [];
  }
}

/**
 * Find matching member by scanning for keywords
 */
async function findMemberByKeywords(content) {
  const normalizedContent = normalizeForMatching(content);
  const keywords = await loadMemberKeywords();

  console.log('Normalized content for matching:', normalizedContent);
  console.log('Total keywords to check:', keywords.length);

  // Scan for keywords (prioritize longer ones first)
  for (const item of keywords) {
    if (normalizedContent.includes(item.keyword)) {
      console.log('✅ MATCH FOUND:', {
        keyword: item.keyword,
        member: item.memberName,
        type: item.type,
        confidence: 95
      });

      return {
        matched: true,
        memberName: item.memberName,
        matchedKeyword: item.keyword,
        matchType: item.type,
        confidence: 95 // High confidence for direct keyword match
      };
    }
  }

  console.log('❌ No keyword match found');
  return {
    matched: false,
    memberName: 'Unknown',
    confidence: 0
  };
}

// ============================================================
// TRANSACTION CATEGORIZATION
// ============================================================

const CATEGORY_KEYWORDS = {
  nop_phat: ['phat', 'penalty', 'fine', 'vi pham', 'PHAT'],
  nop_quy: ['quy', 'fund', 'nop', 'pkb', 'dong gop', 'QUY', 'PKB']
};

function categorizeTransaction(content, amount = 0) {
  const normalizedContent = normalizeText(content);

  // Auto-assign small transactions (≤ 200,000 VND) as penalty payments
  if (amount > 0 && amount <= 200000) {
    return 'nop_phat';
  }

  // Check for penalty keywords
  for (const keyword of CATEGORY_KEYWORDS.nop_phat) {
    if (normalizedContent.includes(normalizeText(keyword))) {
      return 'nop_phat';
    }
  }

  // Check for fund keywords
  for (const keyword of CATEGORY_KEYWORDS.nop_quy) {
    if (normalizedContent.includes(normalizeText(keyword))) {
      return 'nop_quy';
    }
  }

  return 'khac';
}

// ============================================================
// DIRECTION & BANK DETECTION
// ============================================================

// NOTE: detectDirection() đã bị loại bỏ vì SePay LUÔN gửi số dương.
// Hướng giao dịch được xác định từ field `transferType` trong webhook.
// Xem: app/api/webhook/route.js

function detectBank(content) {
  const normalized = content.toUpperCase();
  if (normalized.includes('BIDV')) return 'BIDV';
  if (normalized.includes('MBVCB') || normalized.includes('MB')) return 'MB';
  if (normalized.includes('VCB') || normalized.includes('VIETCOMBANK')) return 'VCB';
  if (normalized.includes('QR')) return 'QR';
  return 'UNKNOWN';
}

// ============================================================
// MAIN EXPORT
// ============================================================

/**
 * Parse transaction using reverse lookup strategy
 * @param {string} content - Nội dung chuyển khoản
 * @param {number} amount - Số tiền (luôn dương)
 * @param {string} accountName - Tên tài khoản
 * @param {string} huongGiaoDich - Hướng giao dịch: 'in' | 'out' (từ webhook, không tự tính)
 */
export async function parseTransaction(content, amount, accountName = '', huongGiaoDich = 'in') {
  console.log('\n=== PARSING TRANSACTION ===');
  console.log('Original content:', content);
  console.log('Amount:', amount);

  let result = {
    memberName: 'Unknown',
    confidence: 0,
    parsingMethod: 'reverse_lookup',
    bankDetected: 'UNKNOWN',
    loaiGiaoDich: huongGiaoDich === 'out' ? 'khac' : 'khac', // Tiền ra mặc định là 'khac'
    huongGiaoDich: huongGiaoDich // Dùng giá trị từ webhook, không tự tính
  };

  if (!content || content.trim().length === 0) {
    // No content, try accountName
    if (accountName) {
      const fallbackMatch = await findMemberByKeywords(accountName);
      if (fallbackMatch.matched) {
        result.memberName = fallbackMatch.memberName;
        result.confidence = fallbackMatch.confidence - 20;
        result.parsingMethod = 'fallback_account';
      } else {
        result.memberName = normalizeText(accountName.substring(0, 50));
        result.confidence = 20;
        result.parsingMethod = 'fallback_raw';
      }
    }
    return result;
  }

  // Detect bank (direction đã được xác định từ webhook, không tự tính)
  result.bankDetected = detectBank(content);
  // result.huongGiaoDich đã được set từ tham số huongGiaoDich
  result.loaiGiaoDich = categorizeTransaction(content, amount);

  // Main matching: Reverse lookup
  const matchResult = await findMemberByKeywords(content);

  if (matchResult.matched) {
    result.memberName = matchResult.memberName;
    result.confidence = matchResult.confidence;
    result.parsingMethod = `reverse_lookup_${matchResult.matchType}`;
  } else {
    // Fallback to accountName
    if (accountName) {
      const fallbackMatch = await findMemberByKeywords(accountName);
      if (fallbackMatch.matched) {
        result.memberName = fallbackMatch.memberName;
        result.confidence = 75;
        result.parsingMethod = 'reverse_lookup_fallback';
      } else {
        result.memberName = normalizeText(accountName.substring(0, 50));
        result.confidence = 15;
        result.parsingMethod = 'no_match';
      }
    }
  }

  console.log('Final result:', result);
  console.log('=== END PARSING ===\n');

  return result;
}

export default {
  parseTransaction,
  normalizeText,
  normalizeForMatching,
  categorizeTransaction
};
