/**
 * PocketBase Diagnostic Script
 * Checks collections and data to diagnose connection issues
 */

import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

// Admin credentials from environment variables
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function diagnose() {
    console.log('🔍 PocketBase Diagnostic Report\n');
    console.log('================================\n');

    // Check connection
    console.log('1. Checking PocketBase connection...');
    try {
        const health = await pb.health.check();
        console.log('   ✅ PocketBase is running\n');
    } catch (err) {
        console.error('   ❌ Cannot connect to PocketBase:', err.message);
        console.log(`   Make sure PocketBase is running at ${process.env.POCKETBASE_URL || 'http://localhost:8090'}\n`);
        process.exit(1);
    }

    // List all collections (requires admin auth)
    console.log('2. Attempting admin authentication...');
    let authenticated = false;

    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        try {
            await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
            console.log(`   ✅ Authenticated as admin: ${ADMIN_EMAIL}\n`);
            authenticated = true;
        } catch (err) {
            console.log('   ⚠️  Authentication failed with provided credentials');
        }
    } else {
        console.log('   ⚠️  PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables not set');
    }

    if (!authenticated) {
        console.log('   Continuing with limited access...\n');
    }

    // List collections
    console.log('3. Listing all collections...');
    try {
        const collections = await pb.collections.getFullList();
        console.log(`   Found ${collections.length} collections:\n`);
        for (const col of collections) {
            console.log(`   📦 ${col.name} (type: ${col.type})`);
            if (col.schema && col.schema.length > 0) {
                console.log(`      Fields: ${col.schema.map(f => f.name).join(', ')}`);
            }
        }
        console.log('');

        // Check specifically for customers vs clients
        const customerCol = collections.find(c => c.name === 'customers');
        const clientCol = collections.find(c => c.name === 'clients');

        if (!customerCol && clientCol) {
            console.log('   ⚠️  ISSUE FOUND: Collection is named "clients" but code expects "customers"!\n');
        } else if (!customerCol && !clientCol) {
            console.log('   ⚠️  ISSUE FOUND: No "customers" collection exists!\n');
        } else if (customerCol) {
            console.log('   ✅ "customers" collection exists\n');
        }

    } catch (err) {
        console.error('   ❌ Failed to list collections:', err.message);
        console.log('   This usually means admin auth is required\n');
    }

    // Try to fetch customers (without auth - should fail based on rules)
    console.log('4. Checking "customers" collection data...');
    try {
        const customers = await pb.collection('customers').getFullList();
        console.log(`   ✅ Found ${customers.length} customer(s):`);
        for (const c of customers) {
            console.log(`      - ${c.name} (ID: ${c.customer_id || c.id})`);
        }
        if (customers.length === 0) {
            console.log('   ⚠️  Collection exists but has no records!\n');
        }
        console.log('');
    } catch (err) {
        if (err.status === 404) {
            console.log('   ❌ "customers" collection does not exist!\n');
        } else if (err.status === 403 || err.status === 401) {
            console.log('   ⚠️  Auth required to access customers (this is expected)\n');
        } else {
            console.error('   ❌ Error:', err.message, '\n');
        }
    }

    // Try to fetch from "clients" collection if it exists
    console.log('5. Checking if "clients" collection exists...');
    try {
        const clients = await pb.collection('clients').getFullList();
        console.log(`   ⚠️  Found "clients" collection with ${clients.length} record(s)!`);
        console.log('   This might be the issue - your code looks for "customers" not "clients"\n');
        for (const c of clients) {
            console.log(`      - ${c.name || c.id}`);
        }
        console.log('');
    } catch (err) {
        if (err.status === 404) {
            console.log('   ✅ No "clients" collection (good - code expects "customers")\n');
        } else {
            console.log('   Could not check "clients" collection\n');
        }
    }

    // Check users collection
    console.log('6. Checking users collection...');
    try {
        const users = await pb.collection('users').getFullList();
        console.log(`   Found ${users.length} user(s):`);
        for (const u of users) {
            console.log(`      - ${u.email}`);
        }
        console.log('');
    } catch (err) {
        console.log('   Could not list users (auth required)\n');
    }

    console.log('================================');
    console.log('Diagnostic complete!\n');
}

diagnose().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
