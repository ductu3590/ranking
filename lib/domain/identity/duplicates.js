'use strict';

function normalizeName(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function normalizedAliases(candidate) {
  return new Set((candidate?.aliases ?? []).map(normalizeName).filter(Boolean));
}

function scoreDuplicateCandidate(left, right) {
  const reasons = [];
  let score = 0;
  const leftName = normalizeName(left?.displayName);
  const rightName = normalizeName(right?.displayName);

  if (leftName && leftName === rightName) {
    score += 50;
    reasons.push('normalized_name_match');
  }

  const rightAliases = normalizedAliases(right);
  if ([...normalizedAliases(left)].some((alias) => rightAliases.has(alias))) {
    score += 20;
    reasons.push('shared_alias');
  }

  if (left?.birthYear && right?.birthYear) {
    if (left.birthYear === right.birthYear) {
      score += 15;
      reasons.push('birth_year_match');
    } else {
      score -= 30;
      reasons.push('birth_year_conflict');
    }
  }

  if (normalizeName(left?.hometown) && normalizeName(left?.hometown) === normalizeName(right?.hometown)) {
    score += 15;
    reasons.push('hometown_match');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    autoMerge: false,
  };
}

function shouldQueueDuplicateReview(result, threshold = 50) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new RangeError('Duplicate review threshold must be between 0 and 100');
  }
  return Boolean(result && Number.isFinite(result.score) && result.score >= threshold);
}

module.exports = { scoreDuplicateCandidate, shouldQueueDuplicateReview };
