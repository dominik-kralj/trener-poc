// Coordination logic lands here (issues #3–#5). Pure TS: no I/O imports.
import { TIME_ZONE } from "@trener/shared";

export const coreInfo = () => ({ timeZone: TIME_ZONE });
