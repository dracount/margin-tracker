# Data Import & Export

The system provides utility scripts to bulk-load data from spreadsheets (CSV/TSV format).

## Initial Seeding
To set up basic collections and sample entries:
```bash
node scripts/seed-db.js
```
*Note: Ensure PocketBase is running and admin credentials in the script match your setup.*

## Bulk CSV Import
The script `scripts/import-csv.js` is designed to parse the standard Margin Tracker spreadsheet format.

### CSV Format Requirements
The script expects a Tab-Separated or Comma-Separated file with the following header logic (matching the provided spreadsheet):
- Column 0: Style #
- Column 1: Factory
- Column 3: Description
- Column 6: Units
- Column 8: Price
- Column 9: Rate
- Column 11: Extra Cost
- Column 13: Selling Price

### How to Import
1. Place your CSV/TSV file in the `uploads/` directory.
2. Run the import script:
   ```bash
   node scripts/import-csv.js uploads/your_file.csv
   ```

## In-App Export
The Dashboard includes an "Export" button that generates a CSV file of the current filtered styles, including all calculated values (Landed Cost, Profit, etc.).

## Real-time Data Management
Since PocketBase is real-time, any data imported via scripts or updated in the PocketBase Admin UI will immediately reflect on all active dashboards without a page refresh.
