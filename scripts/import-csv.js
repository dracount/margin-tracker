/**
 * CSV Import Script for PEEP & HEY BETTY Spreadsheet
 * 
 * Run with: node scripts/import-csv.js uploads/1.csv
 */

import PocketBase from 'pocketbase';
import fs from 'fs';
import path from 'path';

const pb = new PocketBase('http://localhost:8090');

// Admin credentials
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'password';

// Customer details
const CUSTOMER_NAME = 'PEEP & HEY BETTY';
const CUSTOMER_ID = 'PHB001';

function parseCSVLine(line) {
    // Handle tab-separated values
    return line.split('\t').map(cell => cell.trim());
}

function parseNumber(value) {
    if (!value || value === '' || value === '#REF!' || value === '#DIV/0!') return 0;
    // Remove R, spaces, and convert comma decimals to periods
    const cleaned = value.replace(/[R\s]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

async function importCSV(csvPath) {
    console.log('📂 Reading CSV file:', csvPath);

    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    console.log(`📊 Found ${lines.length} lines\n`);

    // Authenticate as admin
    console.log('🔐 Authenticating as admin...');
    try {
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('✅ Authenticated successfully\n');
    } catch (err) {
        console.error('❌ Failed to authenticate:', err.message);
        process.exit(1);
    }

    // Get or create customer
    console.log('👤 Getting customer...');
    let customerId;
    try {
        const existing = await pb.collection('customers').getFirstListItem(`customer_id="${CUSTOMER_ID}"`);
        customerId = existing.id;
        console.log(`ℹ️  Using existing customer ID: ${customerId}\n`);
    } catch (err) {
        // Create if doesn't exist
        const customer = await pb.collection('customers').create({
            name: CUSTOMER_NAME,
            customer_id: CUSTOMER_ID,
        });
        customerId = customer.id;
        console.log(`✅ Customer created with ID: ${customerId}\n`);
    }

    // Skip header row
    const dataLines = lines.slice(1);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    console.log('📊 Importing styles...\n');

    for (const line of dataLines) {
        const cells = parseCSVLine(line);

        // Skip empty rows or rows without a style ID
        const styleId = cells[0];
        if (!styleId || styleId === '' || styleId === '#REF!') {
            skipped++;
            continue;
        }

        // Parse the row data
        // Columns: Style#, Factory, CustDel, Description, Fabric/Trim, Type, Units, Pack, Price, Rate, LC, ExtraCost, TotalCost, SellingPrice, ...
        const style = {
            customer: customerId,
            styleId: styleId,
            factory: cells[1] || '',
            deliveryDate: cells[2] || '',
            description: cells[3] || '',
            fabricTrim: cells[4] || '',
            type: cells[5] || '',
            units: parseNumber(cells[6]),
            pack: parseNumber(cells[7]),
            price: parseNumber(cells[8]),
            rate: parseNumber(cells[9]),
            extraCost: parseNumber(cells[11]), // Column 11 is Extra Cost (skip LC which is calculated)
            sellingPrice: parseNumber(cells[13]), // Column 13 is Actual Selling Price
        };

        // Skip rows with no meaningful data
        if (style.units === 0 && style.price === 0) {
            skipped++;
            continue;
        }

        try {
            // Check if style already exists
            try {
                const existing = await pb.collection('styles').getFirstListItem(`styleId="${styleId}" && customer="${customerId}"`);
                // Update existing
                await pb.collection('styles').update(existing.id, style);
                console.log(`🔄 Updated: ${styleId}`);
            } catch {
                // Create new
                await pb.collection('styles').create(style);
                console.log(`✅ Created: ${styleId}`);
            }
            imported++;
        } catch (err) {
            console.error(`❌ Error with ${styleId}:`, err.message);
            errors++;
        }
    }

    console.log('\n🎉 Import completed!');
    console.log(`   ✅ Imported/Updated: ${imported}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
}

// Run import
const csvPath = process.argv[2] || 'uploads/1.csv';
importCSV(csvPath).catch(console.error);
