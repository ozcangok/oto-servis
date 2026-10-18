import { test as base } from '@playwright/test';
import type { PlayWrightAiFixtureType } from '@midscene/web/playwright';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

/**
 * Midscene AI fixture'larıyla genişletilmiş Playwright `test`.
 *
 * Kullanılabilen fixture'lar (bkz. @midscene/web/playwright):
 *   agentForPage, ai, aiAct, aiTap, aiInput, aiScroll, aiQuery, aiAssert,
 *   aiWaitFor, aiLocate, aiNumber, aiString, aiBoolean, aiAsk, recordToReport ...
 *
 * Tembellik (laziness): Ajan (agent/model) yalnızca gerçekten kullanıldığında
 * oluşturulur. Testler önce `test.skip(!MIDSCENE_READY, SKIP_REASON)` ile
 * atlanabildiği için model anahtarı yokken ağ/model çağrısı yapılmaz.
 *
 * Not: E2E testlerinde çoğunlukla `agentForPage(page)` tercih edilir; bu, ajanı
 * test gövdesinde (skip kontrolünden SONRA) oluşturur.
 */
export const test = base.extend<PlayWrightAiFixtureType>(
  PlaywrightAiFixture({
    // Her aksiyondan sonra ağın sakinleşmesini bekle (kararlılık).
    waitForNetworkIdleTimeout: 2000,
    // aiAct yeniden-planlama döngü üst sınırı.
    replanningCycleLimit: 30
  })
);

export { expect } from '@playwright/test';
