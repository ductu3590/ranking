function organizeFundEvents(events) {
    const activeEvents = [];
    const archivedEvents = [];

    for (const event of events || []) {
        const participants = Array.isArray(event?.fund_event_participants)
            ? event.fund_event_participants
            : [];
        const hasOutstandingPayment = participants.length === 0
            || participants.some((participant) => !participant.has_paid);

        if (event?.is_active !== false && hasOutstandingPayment) {
            activeEvents.push(event);
        } else {
            archivedEvents.push(event);
        }
    }

    return {
        featuredEvent: activeEvents[0] || null,
        otherActiveEvents: activeEvents.slice(1),
        archivedEvents,
    };
}

function buildFundEventPanel(events, showMoreEvents = false) {
    const organized = organizeFundEvents(events);
    const secondaryEvents = [
        ...organized.otherActiveEvents,
        ...organized.archivedEvents,
    ];
    const visibleEvents = organized.featuredEvent
        ? [
            organized.featuredEvent,
            ...(showMoreEvents ? secondaryEvents : []),
        ]
        : (showMoreEvents ? organized.archivedEvents : []);

    return {
        ...organized,
        secondaryEvents,
        visibleEvents,
        showPanel: Boolean(
            organized.featuredEvent
            || (showMoreEvents && organized.archivedEvents.length > 0)
        ),
    };
}

module.exports = {
    buildFundEventPanel,
    organizeFundEvents,
};
