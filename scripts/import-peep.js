/**
 * Import PEEP & HEY BETTY customer with data from 1.csv
 */

import PocketBase from 'pocketbase';
import fs from 'fs';

const pb = new PocketBase('http://localhost:8090');

// Parse number from various formats (handles commas, R prefix, spaces)
function parseNum(val) {
    if (!val || val === '' || val === '0,00') return 0;
    // Remove R prefix, spaces, and convert comma to dot
    const cleaned = String(val).replace(/R/g, '').replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

async function importData() {
    console.log('🚀 Starting import...\n');

    // Auth as admin
    await pb.collection('_superusers').authWithPassword('admin@admin.com', 'password');
    console.log('✅ Authenticated as admin\n');

    // Create customer
    console.log('👤 Creating customer: PEEP & HEY BETTY...');
    let customerId;
    try {
        const customer = await pb.collection('customers').create({
            name: 'PEEP & HEY BETTY',
            customer_id: 'PHB001'
        });
        customerId = customer.id;
        console.log(`✅ Customer created with ID: ${customerId}\n`);
    } catch (err) {
        if (err.message?.includes('already exists') || err.data?.name?.message?.includes('already exists')) {
            console.log('ℹ️  Customer might exist, fetching...');
            try {
                const existing = await pb.collection('customers').getFirstListItem('customer_id="PHB001"');
                customerId = existing.id;
                console.log(`ℹ️  Using existing customer ID: ${customerId}\n`);
            } catch (e) {
                // Try by name
                const existing = await pb.collection('customers').getFirstListItem('name="PEEP & HEY BETTY"');
                customerId = existing.id;
                console.log(`ℹ️  Using existing customer ID: ${customerId}\n`);
            }
        } else {
            throw err;
        }
    }

    // Read and parse CSV
    console.log('📄 Reading CSV file...');
    const csvPath = '/home/david/michael/Margin_Tracker/uploads/1.csv';
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');

    // Skip header row
    const dataLines = lines.slice(1);

    let imported = 0;
    let skipped = 0;

    console.log('📊 Importing styles...\n');

    for (const line of dataLines) {
        if (!line.trim()) continue;

        const cols = line.split('\t');
        const styleId = cols[0]?.trim();

        // Skip empty rows or rows without style ID
        if (!styleId || styleId === '' || styleId === '0,00') {
            skipped++;
            continue;
        }

        // Skip header-like rows
        if (styleId === 'Style #') continue;

        const record = {
            customer: customerId,
            styleId: styleId,
            factory: cols[1]?.trim() || '',
            deliveryDate: cols[2]?.trim() || '',
            description: cols[3]?.trim() || '',
            fabricTrim: cols[4]?.trim() || '',
            type: cols[5]?.trim() || '',
            units: parseNum(cols[6]),
            pack: parseNum(cols[7]),
            price: parseNum(cols[8]),
            rate: parseNum(cols[9]),
            extraCost: parseNum(cols[11]), // Col 11 is Extra Cost (skip LC at col 10)
            sellingPrice: parseNum(cols[13]), // Col 13 is Actual Selling Price
        };

        // Skip if no meaningful data
        if (!record.styleId || (record.units === 0 && record.price === 0)) {
            skipped++;
            continue;
        }

        try {
            await pb.collection('styles').create(record);
            console.log(`   ✅ ${record.styleId}: ${record.description || '(no description)'}`);
            imported++;
        } catch (err) {
            console.log(`   ⚠️  ${record.styleId}: ${err.message}`);
            skipped++;
        }
    }

    console.log(`\n🎉 Import complete!`);
    console.log(`   Imported: ${imported} styles`);
    console.log(`   Skipped: ${skipped} rows`);
}

importData().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
