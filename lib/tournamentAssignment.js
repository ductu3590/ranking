export const TOURNAMENT_FORMATS = {
    mlp_team: {
        label: 'MLP Team Match',
        defaultTeamSize: 4,
        defaultTeamsPerMatch: 2,
    },
    doubles_round_robin: {
        label: 'Đánh đôi vòng tròn',
        defaultTeamSize: 2,
        defaultTeamsPerMatch: 2,
    },
    group_playoff: {
        label: 'Vòng bảng + Playoff',
        defaultTeamSize: 2,
        defaultTeamsPerMatch: 2,
    },
    knockout: {
        label: 'Loại trực tiếp',
        defaultTeamSize: 2,
        defaultTeamsPerMatch: 2,
    },
};

const MLP_TEAM_NAMES = [
    { code: 'blue', name: 'Team Xanh' },
    { code: 'red', name: 'Team Đỏ' },
    { code: 'gold', name: 'Team Vàng' },
    { code: 'green', name: 'Team Xanh Lá' },
];

export function shuffleMembers(members) {
    const result = [...(members || [])];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function buildRandomTeams(members, options = {}) {
    const teamSize = Number(options.teamSize) || TOURNAMENT_FORMATS.mlp_team.defaultTeamSize;
    const teamsPerMatch = Number(options.teamsPerMatch) || TOURNAMENT_FORMATS.mlp_team.defaultTeamsPerMatch;
    const shuffled = shuffleMembers(members).slice(0, teamSize * teamsPerMatch);

    return Array.from({ length: teamsPerMatch }, (_, index) => {
        const template = MLP_TEAM_NAMES[index] || { code: `team-${index + 1}`, name: `Team ${index + 1}` };
        return {
            team_code: template.code,
            team_name: template.name,
            players: shuffled.slice(index * teamSize, (index + 1) * teamSize),
        };
    });
}

export function buildRandomPairs(members) {
    const shuffled = shuffleMembers(members);
    const pairCount = Math.floor(shuffled.length / 2);

    return Array.from({ length: pairCount }, (_, index) => ({
        team_code: `pair-${index + 1}`,
        team_name: `Cặp ${index + 1}`,
        players: shuffled.slice(index * 2, index * 2 + 2),
    }));
}

export function buildTournamentAssignments(members, options = {}) {
    if (options.format === 'mlp_team') {
        return buildRandomTeams(members, options);
    }
    return buildRandomPairs(members);
}
