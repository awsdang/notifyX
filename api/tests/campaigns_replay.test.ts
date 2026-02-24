import { describe, it, expect, mock, beforeEach, beforeAll } from "bun:test";

// 1. Mock Queue before implementation import
const mockAddNotificationToQueue = mock(() => Promise.resolve("job-id"));
const mockAddDeliveriesToQueue = mock(() => Promise.resolve(["job-id"]));

mock.module("../src/services/queue", () => ({
  addNotificationToQueue: mockAddNotificationToQueue,
  addDeliveriesToQueue: mockAddDeliveriesToQueue,
}));

// 2. Mock Prisma
const mockFindMany = mock();
const mockTransaction = mock();
const mockUpdate = mock();
// Mock prisma query builder style for update inside map
// In implementation: prisma.$transaction(failedDeliveries.map(d => prisma.notificationDelivery.update(...)))
// So we need prisma.notificationDelivery.update to return a Promise (or object) that transaction can accept

mock.module("../src/services/database", () => ({
  prisma: {
    notificationDelivery: {
      findMany: mockFindMany,
      update: mockUpdate,
    },
    $transaction: mockTransaction,
  },
}));

// 3. Import implementation dynamically
describe("Campaigns Controller - Replay Failures", () => {
  let replayCampaignFailures: any;

  beforeAll(async () => {
    const mod = await import("../src/controllers/campaigns");
    replayCampaignFailures = mod.replayCampaignFailures;
  });

  beforeEach(() => {
    mockAddNotificationToQueue.mockReset();
    mockAddDeliveriesToQueue.mockReset();
    mockFindMany.mockReset();
    mockTransaction.mockReset();
    mockUpdate.mockReset();
  });

  it("should replay failed notifications and enqueue them", async () => {
    const req = {
      params: { id: "campaign-123" },
      body: { filters: {} },
    } as any;
    const res = {
      send: mock(),
      json: mock(),
      status: mock().mockReturnThis(),
    } as any;
    const next = mock();

    // Mock failed deliveries found
    const failures = [
      {
        id: "del-1",
        notificationId: "notif-1",
        notification: { appId: "app-1", priority: "NORMAL" },
        device: { id: "dev-1", provider: "fcm", pushToken: "t1" },
      },
      {
        id: "del-2",
        notificationId: "notif-2",
        notification: { appId: "app-1", priority: "NORMAL" },
        device: { id: "dev-2", provider: "fcm", pushToken: "t2" },
      },
    ];
    mockFindMany.mockResolvedValue(failures);

    // Mock transaction success
    mockTransaction.mockResolvedValue([{}, {}]); // 2 updates

    // Mock queue success
    mockAddNotificationToQueue.mockResolvedValue("job-123");

    await replayCampaignFailures(req, res, next);

    // Verify finding failures
    expect(mockFindMany).toHaveBeenCalled();
    const findArgs = mockFindMany.mock.calls[0]![0];
    expect(findArgs.where.notification.campaignId).toBe("campaign-123");

    // Verify Transaction called (resetting status)
    expect(mockTransaction).toHaveBeenCalled();
    // Check that update was called twice (inside map)
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    // Verify Queueing (batched delivery jobs)
    expect(mockAddNotificationToQueue).toHaveBeenCalledTimes(0);
    expect(mockAddDeliveriesToQueue).toHaveBeenCalledTimes(1);
    const queueCall = (mockAddDeliveriesToQueue.mock.calls as any[])[0];
    expect(queueCall?.[1]).toBe("NORMAL");
    expect(queueCall?.[0]).toHaveLength(2);
    expect(next).not.toHaveBeenCalled();

    // Verify Response
    expect(res.json).toHaveBeenCalledWith({
      error: false,
      message: "Success",
      data: { replayedCount: 2 },
    });
  });
});
