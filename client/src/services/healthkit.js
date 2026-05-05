import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";

export function isNativeIos() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function checkHealthKitAvailable() {
  if (!isNativeIos()) return false;
  const result = await Health.isHealthAvailable();
  return Boolean(result?.value);
}

export async function requestHealthKitPermissions() {
  if (!isNativeIos()) {
    return { granted: false, reason: "not_ios_native" };
  }

  const read = ["steps", "heart_rate", "sleep", "calories", "weight"];
  const write = ["steps", "weight"];
  await Health.requestHealthPermissions({ read, write });
  return { granted: true };
}

export async function fetchHealthKitDailySummary() {
  if (!isNativeIos()) return null;

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6);

  const options = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    bucket: "day",
  };

  const [steps, sleep, heartRate] = await Promise.all([
    Health.queryAggregated({ ...options, metric: "steps" }),
    Health.queryAggregated({ ...options, metric: "sleep" }),
    Health.queryAggregated({ ...options, metric: "heart_rate" }),
  ]);

  return {
    steps: steps?.value || [],
    sleep: sleep?.value || [],
    heartRate: heartRate?.value || [],
  };
}
