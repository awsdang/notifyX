export interface ABTestFanoutStrategy {
  mode: "direct" | "batched";
  pageSize: number;
}

const DIRECT_USER_LIMIT = parseInt(
  process.env.ABTEST_DIRECT_USER_LIMIT || "2500",
  10,
);
const DEFAULT_PAGE_SIZE = parseInt(process.env.ABTEST_PAGE_SIZE || "500", 10);
const LARGE_PAGE_SIZE = parseInt(
  process.env.ABTEST_LARGE_PAGE_SIZE || "1000",
  10,
);
const LARGE_AUDIENCE_THRESHOLD = parseInt(
  process.env.ABTEST_LARGE_AUDIENCE_THRESHOLD || "200000",
  10,
);

export function chooseABTestFanoutStrategy(
  totalUsers: number,
): ABTestFanoutStrategy {
  if (totalUsers <= DIRECT_USER_LIMIT) {
    return {
      mode: "direct",
      pageSize: Math.max(100, totalUsers || DEFAULT_PAGE_SIZE),
    };
  }

  if (totalUsers >= LARGE_AUDIENCE_THRESHOLD) {
    return {
      mode: "batched",
      pageSize: Math.max(DEFAULT_PAGE_SIZE, LARGE_PAGE_SIZE),
    };
  }

  return {
    mode: "batched",
    pageSize: DEFAULT_PAGE_SIZE,
  };
}
