import type { SocialPlatform } from "@/generated/prisma/enums";
import { socialLabel } from "@/lib/constants";
export { formatDate } from "@/lib/utils";
export const socialLabelSafe = (p: SocialPlatform) => socialLabel(p);
