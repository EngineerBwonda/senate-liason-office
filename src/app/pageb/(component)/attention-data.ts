export type AttentionCardConfig = {
  id: string;
  table: string;
  key: string;
  singular: string;
  plural: string;
};

export const ATTENTION_LAST_OPENED_EVENT = "attention:last-opened-updated";

export const ATTENTION_CARDS: AttentionCardConfig[] = [
  {
    id: "memos",
    table: "memo",
    key: "memo:last-opened-at",
    singular: "Needs Attention",
    plural: "Need Attention",
  },
  {
    id: "incoming-correspondence",
    table: "incoming_correspondence",
    key: "incoming-correspondence:last-opened-at",
    singular: "New Correspondence",
    plural: "New Correspondence",
  },
  {
    id: "outgoing-correspondence",
    table: "outgoing_correspondence",
    key: "outgoing-correspondence:last-opened-at",
    singular: "New Outgoing",
    plural: "New Outgoing",
  },
  {
    id: "monthly-reports",
    table: "monthly_reports",
    key: "monthly-reports:last-opened-at",
    singular: "New Monthly Report",
    plural: "New Monthly Reports",
  },
  {
    id: "annual-reports",
    table: "annual_reports",
    key: "annual-reports:last-opened-at",
    singular: "New Annual Report",
    plural: "New Annual Reports",
  },
  {
    id: "quarterly-reports",
    table: "quarterlyb_reports",
    key: "quarterly-reports:last-opened-at",
    singular: "Needs Attention",
    plural: "Need Attention",
  },
  {
    id: "minutes",
    table: "minutes",
    key: "minutes:last-opened-at",
    singular: "New Minute",
    plural: "New Minutes",
  },
];
