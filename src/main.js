import { byId, loadRegister } from "./register.js";
import { createLive } from "./live.js";
import { initReveal, initScroll } from "./ui/motion.js";
import { initTheme } from "./ui/theme.js";
import { initContract, initFootFlag, initLedger, initSocials } from "./ui/record.js";
import { initFaq, initMenu, initSpy } from "./ui/chrome.js";
import { bindLive } from "./ui/render.js";

const register = loadRegister();

initTheme();
initContract(register);
initSocials(register);
initLedger(register);
initFootFlag(register);
initMenu();
initFaq();
initSpy();
initScroll();

const live = createLive({
  rpcUrl: byId(register, "rpc").value,
  expectedChainId: Number(byId(register, "chain-id").value),
});
bindLive(live, register);
initReveal();
live.start();
