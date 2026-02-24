import { describe, it, expect, mock, spyOn, beforeEach } from "bun:test";
import { Readable } from "stream";
import { prisma } from "../src/services/database";
import { minioClient } from "../src/services/storage";
import { getDetailedAudienceEstimate } from "../src/controllers/campaigns";

// 1. Setup Spies
const spyAssetFindUnique = spyOn(prisma.asset, "findUnique");
const spyUserCount = spyOn(prisma.user, "count");
const spyDeviceGroupBy = spyOn(prisma.device, "groupBy");
const spyMinioGetObject = spyOn(minioClient, "getObject");

describe("Campaigns Controller - CSV Audience", () => {
  beforeEach(() => {
    spyMinioGetObject.mockReset();
    spyAssetFindUnique.mockReset();
    spyUserCount.mockReset();
    spyDeviceGroupBy.mockReset();
  });

  it("should parse CSV and count users correctly", async () => {
    const req = {
      body: {
        appId: "test-app",
        targetingMode: "CSV",
        assetId: "test-asset",
      },
      params: {},
    } as any;

    const res = {
      json: mock(),
      status: mock().mockReturnThis(),
    } as any;

    const next = mock();

    // Setup Mocks
    spyAssetFindUnique.mockResolvedValue({
      id: "test-asset",
      url: "http://minio/bucket/users.csv",
    } as any);

    const csvContent = `externalUserId,someData
user1,data1
user2,data2
user3,data3`;
    const stream = Readable.from([csvContent]);
    spyMinioGetObject.mockResolvedValue(stream as any);

    spyUserCount.mockResolvedValue(3);

    spyDeviceGroupBy.mockResolvedValue([
      { provider: "fcm", platform: "android", _count: 2 },
      { provider: "apns", platform: "ios", _count: 1 },
    ] as any);

    await getDetailedAudienceEstimate(req, res, next);

    // Verify Asset Fetch
    expect(spyAssetFindUnique).toHaveBeenCalledWith({
      where: { id: "test-asset" },
    });

    // Verify Stream Request (arg 1 is bucket, arg 2 is objectName)
    expect(spyMinioGetObject).toHaveBeenCalled();
    const callArgs = spyMinioGetObject.mock.calls[0];
    // storage.ts calls getObject(bucket, objectName)
    expect(callArgs![1]).toBe("users.csv");

    // Verify User Count
    expect(spyUserCount).toHaveBeenCalled();
    const userCountArgs = spyUserCount.mock.calls[0]![0] as any;
    expect(userCountArgs.where.externalUserId.in).toEqual([
      "user1",
      "user2",
      "user3",
    ]);

    // Verify Response
    expect(res.json).toHaveBeenCalledWith({
      error: false,
      message: "Success",
      data: {
        estimatedUsers: 3,
        estimatedDevices: 3,
        breakdown: { fcm: 2, apns: 1 },
        assumptions: expect.any(Object),
      },
    });
  });

  it("should handle CSV without headers (fallback to first col)", async () => {
    const req = {
      body: {
        appId: "test-app",
        targetingMode: "CSV",
        assetId: "test-asset-no-header",
      },
      params: {},
    } as any;
    const res = { json: mock(), status: mock().mockReturnThis() } as any;
    const next = mock();

    spyAssetFindUnique.mockResolvedValue({
      id: "test-asset-no-header",
      url: "http://minio/bucket/pure-ids.csv",
    } as any);

    const csvContent2 = `header_id
user_A`;
    spyMinioGetObject.mockResolvedValue(Readable.from([csvContent2]) as any);

    spyUserCount.mockResolvedValue(1);
    spyDeviceGroupBy.mockResolvedValue([] as any);

    await getDetailedAudienceEstimate(req, res, next);

    const callArgs = spyUserCount.mock.calls[0]![0] as any;
    expect(callArgs.where.externalUserId.in).toEqual(["user_A"]);
  });
});
