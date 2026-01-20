/**
 * Fix the customers collection schema - add missing fields
 */

import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

// Admin credentials from environment variables
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function fix() {
    console.log('🔧 Fixing customers collection schema...\n');

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.error('Error: PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables must be set');
        process.exit(1);
    }

    // Auth as admin
    await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log('✅ Authenticated as admin\n');

    // Get current collection
    const collection = await pb.collections.getOne('customers');
    console.log('Current fields:', collection.fields.map(f => f.name).join(', '));

    // Add missing fields
    const newFields = [
        ...collection.fields,
        { name: 'name', type: 'text', required: true },
        { name: 'customer_id', type: 'text', required: true },
        { name: 'logo', type: 'file', options: { maxSelect: 1, maxSize: 5242880 } }
    ];

    // Update collection with new fields
    console.log('\n📝 Adding fields: name, customer_id, logo...');
    await pb.collections.update('customers', {
        fields: newFields
    });

    console.log('✅ Collection schema updated!\n');

    // Verify the update
    const updated = await pb.collections.getOne('customers');
    console.log('New fields:', updated.fields.map(f => f.name).join(', '));

    // Now update the existing records with sample data or delete them
    console.log('\n🗑️  Deleting empty records (they have no data)...');
    const emptyRecords = await pb.collection('customers').getFullList();
    for (const rec of emptyRecords) {
        await pb.collection('customers').delete(rec.id);
        console.log(`   Deleted empty record: ${rec.id}`);
    }

    // Create a sample customer
    console.log('\n👤 Creating sample customer...');
    const customer = await pb.collection('customers').create({
        name: 'Sample Customer',
        customer_id: 'CUST001'
    });
    console.log(`✅ Created: ${customer.name} (${customer.customer_id})\n`);

    console.log('🎉 Done! The customers collection is now properly configured.');
    console.log('   You can add more customers via the PocketBase Admin UI at http://localhost:8090/_/');
}

fix().catch(console.error);
