import { selectPlan } from './calibration';
import type { Settings } from './config';
import type { Identity } from './identities';
import { initPhysics } from './physics';

export type PreflightRequest = { token: number; settings: Settings; number: number; roster: readonly Identity[]; previous: string };
self.onmessage = async ({ data }: MessageEvent<PreflightRequest>) => {
  try {
    await initPhysics();
    const { plan, forecast } = selectPlan(data.settings, data.number, data.roster, data.previous);
    self.postMessage({ token: data.token, plan, forecast });
  } catch (error) {
    self.postMessage({ token: data.token, error: String(error) });
  }
};
