import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000';

async function main() {
    const count = parseInt(process.argv[2] || '1000');
    const priority = process.argv[3] || 'NORMAL'; // 'HIGH' or 'NORMAL'

    console.log(`Starting Stress Test for ${count} notifications (Priority: ${priority})...`);

    // 1. Create App
    const appRes = await fetch(`${API_URL}/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `StressTest_${Date.now()}`, platforms: { web: true }, defaultLanguage: 'en' })
    });
    if (!appRes.ok) throw new Error('Failed to create app');
    const app = await appRes.json() as any;
    console.log(`Created App: ${app.name} (${app.id})`);

    // 2. Prepare Requests
    const batchSize = 100;
    const batches = Math.ceil(count / batchSize);

    console.log(`Sending ${count} requests in ${batches} batches...`);
    const startTime = Date.now();

    for (let i = 0; i < batches; i++) {
        const promises = [];
        for (let j = 0; j < batchSize; j++) {
            if (i * batchSize + j >= count) break;
            promises.push(
                fetch(`${API_URL}/notifications`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appId: app.id,
                        type: 'transactional',
                        title: `Stress Test ${priority} ${i}-${j}`,
                        body: 'Load verification',
                        priority: priority,
                        userIds: [`user_${i}_${j}`]
                    })
                })
            );
        }
        await Promise.all(promises);
        process.stdout.write('.');
    }
    const sentTime = Date.now();
    console.log(`\n\nAll ${count} requests SENT in ${(sentTime - startTime) / 1000}s`);

    // 3. Monitor Processing
    console.log('Monitoring processing...');

    let processed = 0;
    // We need to wait a bit for queue to pick up
    await new Promise(r => setTimeout(r, 1000));

    while (processed < count) {
        const sentCount = await prisma.notification.count({
            where: { appId: app.id, status: 'SENT' }
        });
        const failedCount = await prisma.notification.count({
            where: { appId: app.id, status: 'FAILED' }
        });

        processed = sentCount + failedCount;
        process.stdout.write(`\rProcessed: ${processed}/${count}`);

        if (processed >= count) break;
        await new Promise(r => setTimeout(r, 500));
    }

    const endTime = Date.now();
    // Duration of PROCESSING only (from First Sent to Last Sent?)
    // Or end-to-end?
    // Let's measure End-to-End first.
    const totalTime = (endTime - startTime) / 1000;

    // Approximate Processing Time:
    const processingTime = (endTime - sentTime) / 1000;

    console.log(`\n\nDONE!`);
    console.log(`Total E2E Time: ${totalTime.toFixed(2)}s`);
    console.log(`Processing Time: ${processingTime.toFixed(2)}s`);
    console.log(`E2E Throughput: ${(count / totalTime).toFixed(2)} notifications/sec`);

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
