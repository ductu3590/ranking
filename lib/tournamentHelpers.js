// Tournament Management Helper Functions
// Validation, calculations, and business logic for tournament system

/**
 * Validate pairings for a specific round
 * @param {number} round - Round number (1, 2, 3)
 * @param {Array} pairings - Array of pairing objects
 * @param {Array} previousRoundsPairings - Pairings from previous rounds (for Round 2 validation)
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validatePairings(round, pairings, previousRoundsPairings = []) {
    const errors = [];

    // Check if we have exactly 4 pairs
    if (pairings.length !== 4) {
        errors.push('Phải có đúng 4 cặp đôi');
    }

    // Check for duplicate players
    const duplicateCheck = checkDuplicatePlayers(pairings);
    if (!duplicateCheck.valid) {
        errors.push(...duplicateCheck.errors);
    }

    // Round-specific validation
    if (round === 2 && previousRoundsPairings.length > 0) {
        // Round 2: Must change pairs from Round 1
        const round1Pairings = previousRoundsPairings.filter(p => p.round_number === 1);
        const hasUnchangedPairs = compareRoundPairings(pairings, round1Pairings);
        if (hasUnchangedPairs) {
            errors.push('Vòng 2 không được giữ nguyên cặp của Vòng 1');
        }
    }

    // Check each pair has exactly 2 players
    pairings.forEach((pair, index) => {
        if (!pair.player1_id || !pair.player2_id) {
            errors.push(`Cặp ${index + 1} phải có đủ 2 người`);
        }
        if (pair.player1_id === pair.player2_id) {
            errors.push(`Cặp ${index + 1} không thể có cùng 1 người`);
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Check for duplicate players across pairings
 * @param {Array} pairings - Array of pairing objects
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function checkDuplicatePlayers(pairings) {
    const playerIds = [];
    const errors = [];

    pairings.forEach((pair, index) => {
        if (pair.player1_id) {
            if (playerIds.includes(pair.player1_id)) {
                errors.push(`Người chơi ID ${pair.player1_id} xuất hiện nhiều hơn 1 lần`);
            } else {
                playerIds.push(pair.player1_id);
            }
        }

        if (pair.player2_id) {
            if (playerIds.includes(pair.player2_id)) {
                errors.push(`Người chơi ID ${pair.player2_id} xuất hiện nhiều hơn 1 lần`);
            } else {
                playerIds.push(pair.player2_id);
            }
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Compare two rounds to check if any pairs are unchanged
 * @param {Array} currentPairings - Current round pairings
 * @param {Array} previousPairings - Previous round pairings
 * @returns {boolean} True if there are unchanged pairs
 */
export function compareRoundPairings(currentPairings, previousPairings) {
    for (const currentPair of currentPairings) {
        for (const prevPair of previousPairings) {
            // Check if the same 2 players are paired together
            const isSamePair = (
                (currentPair.player1_id === prevPair.player1_id && currentPair.player2_id === prevPair.player2_id) ||
                (currentPair.player1_id === prevPair.player2_id && currentPair.player2_id === prevPair.player1_id)
            );

            if (isSamePair) {
                return true; // Found unchanged pair
            }
        }
    }
    return false; // No unchanged pairs
}

/**
 * Calculate team score from matches
 * @param {Array} matches - Array of match objects
 * @param {string} teamCode - 'blue' or 'red'
 * @returns {Object} { round1: number, round2: number, round3: number, total: number }
 */
export function calculateTeamScore(matches, teamCode) {
    const scores = {
        round1: 0,
        round2: 0,
        round3: 0,
        total: 0
    };

    matches.forEach(match => {
        if (match.match_status !== 'completed') return;

        const wonMatch = match.winner_team === teamCode;
        if (!wonMatch) return;

        // Round 1 & 2: 1 point per match
        if (match.round_number === 1) {
            scores.round1 += 1;
        } else if (match.round_number === 2) {
            scores.round2 += 1;
        } else if (match.round_number === 3) {
            // Round 3: 3 points
            scores.round3 += 3;
        }
    });

    scores.total = scores.round1 + scores.round2 + scores.round3;
    return scores;
}

/**
 * Check if Round 1 can be revealed based on current time
 * @param {string} revealTime - ISO timestamp from tournament_settings
 * @returns {boolean} True if current time >= reveal time
 */
export function canRevealRound1(revealTime) {
    if (!revealTime) return false;

    const now = new Date();
    const reveal = new Date(revealTime);

    return now >= reveal;
}

/**
 * Get tournament phase based on current state
 * @param {Object} settings - Tournament settings
 * @param {Array} matches - All matches
 * @returns {string} 'pre_match' | 'live' | 'completed'
 */
export function getTournamentPhase(settings, matches) {
    // Check if tournament is completed
    const allMatchesCompleted = matches.every(m => m.match_status === 'completed');
    if (allMatchesCompleted && matches.length > 0) {
        return 'completed';
    }

    // Check if any match is live or completed
    const hasActiveMatches = matches.some(m => ['live', 'completed'].includes(m.match_status));
    if (hasActiveMatches) {
        return 'live';
    }

    return 'pre_match';
}

/**
 * Format player name for display (shorten long names)
 * @param {string} name - Full player name
 * @returns {string} Formatted name
 */
export function formatPlayerName(name) {
    if (!name) return '';

    // Handle "KM - " prefix
    if (name.startsWith('KM - ')) {
        return name;
    }

    // For regular names, show first name and last name initial
    const parts = name.trim().split(' ');
    if (parts.length <= 2) return name;

    // Example: "NGUYỄN MẠNH THẮNG" -> "MẠNH THẮNG"
    return parts.slice(-2).join(' ');
}

/**
 * Determine which team can choose matchups in Round 2
 * @param {Object} round1Winner - 'blue', 'red', or null (if tie)
 * @returns {Object} { choosingTeam: string, waitingTeam: string }
 */
export function getRound2MatchupLogic(round1Winner) {
    if (!round1Winner) {
        // Tie case - need to randomize or manual selection
        return {
            choosingTeam: null,
            waitingTeam: null,
            note: 'Hòa Vòng 1 - cần bốc thăm'
        };
    }

    // Losing team chooses matchups
    const choosingTeam = round1Winner === 'blue' ? 'red' : 'blue';
    const waitingTeam = round1Winner;

    return {
        choosingTeam,
        waitingTeam,
        note: `Team ${choosingTeam.toUpperCase()} (thua Vòng 1) được chọn cặp đấu`
    };
}

/**
 * Validate match score input
 * @param {number} score - Score value
 * @param {number} roundNumber - Round number
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateMatchScore(score, roundNumber) {
    if (typeof score !== 'number' || score < 0) {
        return { valid: false, error: 'Điểm số phải là số không âm' };
    }

    // Round 1 & 2: Max 17 points
    if (roundNumber <= 2 && score > 17) {
        return { valid: false, error: 'Vòng 1-2 tối đa 17 điểm' };
    }

    // Round 3: Max 25 points
    if (roundNumber === 3 && score > 25) {
        return { valid: false, error: 'Vòng 3 tối đa 25 điểm' };
    }

    return { valid: true };
}
