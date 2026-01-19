import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function main() {
    console.log('Setting up PocketBase collection rules...\n');

    // Authenticate as admin
    try {
        await pb.admins.authWithPassword('admin@margin.local', 'admin123');
        console.log('Authenticated as admin\n');
    } catch (err) {
        console.error('Admin auth failed:', err);
        process.exit(1);
    }

    // Rule for authenticated users only
    const authRule = '@request.auth.id != ""';

    // Update customers collection
    try {
        const customers = await pb.collections.getOne('customers');
        await pb.collections.update('customers', {
            listRule: authRule,
            viewRule: authRule,
            createRule: null,  // Only admins can create
            updateRule: null,  // Only admins can update
            deleteRule: null,  // Only admins can delete
        });
        console.log('Updated customers collection rules');
    } catch (err) {
        console.error('Error updating customers:', err.message || err);
    }

    // Update styles collection
    try {
        const styles = await pb.collections.getOne('styles');
        await pb.collections.update('styles', {
            listRule: authRule,
            viewRule: authRule,
            createRule: authRule,
            updateRule: authRule,
            deleteRule: authRule,
        });
        console.log('Updated styles collection rules');
    } catch (err) {
        console.error('Error updating styles:', err.message || err);
    }

    console.log('\nDone! Users can now access the data after logging in.');
}

main().catch(console.error);
