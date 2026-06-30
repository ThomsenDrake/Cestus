import { InMemoryEventLedger } from "../src/event-ledger.js";
import { describeEventLedgerContract } from "./ledger-contract.test-helper.js";

describeEventLedgerContract("InMemoryEventLedger", {
  createLedger: () => ({ ledger: new InMemoryEventLedger() })
});
