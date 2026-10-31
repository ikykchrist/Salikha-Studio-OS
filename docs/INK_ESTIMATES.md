# Estimated printer ink

- Printer 1 and Printer 2 are independent. Each event closeout selects the printer used.
- Actual paper packs consumed convert to 4R printed sheets at **20 sheets per pack**. Paper pieces/sheets count one each. Frame/magnetic-supply packs are excluded. Enter an explicit whole printed-sheet count for waste, test prints, reprints, custom item names or other units.
- Starting model: **0.20 mL total ink per 4R sheet**, allocated equally to six colors. This is an editable business assumption, not measured Inkrite performance or a printer specification.
- At PHP 130 / 70 mL per color, one 20-sheet pack estimates 4 mL total and PHP 7.43 ink cost.
- Starting full-level reference: **70 mL per color**. This is a modeling assumption for percentage deductions, not verified tank capacity. Admins can calibrate it and the mL/sheet rate under Inventory > selected printer > Edit assumptions.
- Known percentages are reduced on committed closeout, floored at zero; unknown levels remain unknown. Manual checks/refills remain the source of observed levels. Unchanged `checked_at` means an automated deduction is not a new physical reading.
- Closeout stores the printed count, per-color usage, price/rate snapshots and estimated event cost once. Repeated closeout cannot deduct twice. Updated assumptions apply only to future events.
- Reporting includes the saved estimate as a direct non-cash consumption cost, separately labeled Estimated. It creates no new cash transaction, unpaid supplier bill or bottled-stock movement. Do not add recipe ink and an automatic estimate for the same prints; the closeout rejects that combination.
- Costs and printer updates share the booking closeout transaction. Errors roll back the stock and ink changes together.
- Initial fill, cleaning, image coverage and uneven color use are not measured by this model. Compare actual refill volumes and physical levels over a representative batch before treating the rate as calibrated.

Checks: `node scripts/verify-ink-estimate.mjs`, `node scripts/verify-printer-ink.mjs`, `node scripts/verify-closeout-feedback.mjs`, `node scripts/verify-event-operations.mjs`.
