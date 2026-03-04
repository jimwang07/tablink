export const Constants = {
    graphql_public: {
        Enums: {},
    },
    public: {
        Enums: {
            claim_status: ["unrequested", "requested", "paid"],
            item_state: ["unclaimed", "claimed", "settled"],
            participant_role: ["owner", "guest"],
            receipt_event_type: [
                "item_claimed",
                "item_unclaimed",
                "item_settled",
                "receipt_status_changed",
                "participant_added",
                "participant_removed",
                "payment_requested",
                "payment_marked_paid",
            ],
            receipt_status: [
                "draft",
                "ready",
                "shared",
                "partially_claimed",
                "fully_claimed",
                "settled",
            ],
            settlement_status: ["open", "requested", "paid"],
        },
    },
};
//# sourceMappingURL=database.types.js.map