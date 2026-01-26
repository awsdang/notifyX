import { describe, it, expect, mock, beforeEach, beforeAll } from 'bun:test';

// 1. Mock Queue before implementation import
const mockAddNotificationToQueue = mock(() => Promise.resolve('job-id'));

mock.module('../src/services/queue', () => ({
    addNotificationToQueue: mockAddNotificationToQueue,
}));

// 2. Mock Prisma
const mockFindMany = mock();
const mockTransaction = mock();
const mockUpdate = mock();
// Mock prisma query builder style for update inside map
// In implementation: prisma.$transaction(failedDeliveries.map(d => prisma.notificationDelivery.update(...)))
// So we need prisma.notificationDelivery.update to return a Promise (or object) that transaction can accept

mock.module('../src/services/database', () => ({
    prisma: {
        notificationDelivery: {
            findMany: mockFindMany,
            update: mockUpdate,
        },
        $transaction: mockTransaction,
    }
}));

// 3. Import implementation dynamically
describe('Campaigns Controller - Replay Failures', () => {
    let replayCampaignFailures: any;

    beforeAll(async () => {
        const mod = await import('../src/controllers/campaigns');
        replayCampaignFailures = mod.replayCampaignFailures;
    });

    beforeEach(() => {
        mockAddNotificationToQueue.mockReset();
        mockFindMany.mockReset();
        mockTransaction.mockReset();
        mockUpdate.mockReset();
    });

    it('should replay failed notifications and enqueue them', async () => {
        const req = {
            params: { id: 'campaign-123' },
            body: { filters: {} }
        } as any;
        const res = { send: mock(), json: mock(), status: mock().mockReturnThis() } as any;
        const next = mock();

        // Mock failed deliveries found
        const failures = [
            { id: 'del-1', notificationId: 'notif-1' },
            { id: 'del-2', notificationId: 'notif-2' },
        ];
        mockFindMany.mockResolvedValue(failures);

        // Mock transaction success
        mockTransaction.mockResolvedValue([{}, {}]); // 2 updates

        // Mock queue success
        mockAddNotificationToQueue.mockResolvedValue('job-123');

        await replayCampaignFailures(req, res, next);

        // Verify finding failures
        expect(mockFindMany).toHaveBeenCalled();
        const findArgs = mockFindMany.mock.calls[0]![0];
        expect(findArgs.where.notification.campaignId).toBe('campaign-123');

        // Verify Transaction called (resetting status)
        expect(mockTransaction).toHaveBeenCalled();
        // Check that update was called twice (inside map)
        expect(mockUpdate).toHaveBeenCalledTimes(2);

        // Verify Queueing
        expect(mockAddNotificationToQueue).toHaveBeenCalledTimes(2);
        expect(mockAddNotificationToQueue).toHaveBeenCalledWith('notif-1', 'NORMAL');
        expect(mockAddNotificationToQueue).toHaveBeenCalledWith('notif-2', 'NORMAL');

        // Verify Response
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { replayedCount: 2 }
        });
    });
});
