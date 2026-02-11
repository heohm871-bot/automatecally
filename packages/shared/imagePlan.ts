import type { Intent } from "./intent";

export type ImgKind = "photo" | "infographic";
export type InfoType = "flow" | "checklist" | "compare" | "matrix" | "riskmap" | "scenario" | "proscons";

export type ImagePlan = Record<
  "h2_1" | "h2_2" | "h2_3" | "h2_4",
  { kind: ImgKind; infoType?: InfoType }
>;

export function buildImagePlan(intent: Intent): ImagePlan {
  const plan: ImagePlan = {
    h2_1: { kind: "photo" },
    h2_2: { kind: "infographic", infoType: "checklist" },
    h2_3: { kind: "photo" },
    h2_4: { kind: "infographic", infoType: "compare" }
  };

  if (intent === "howto") {
    plan.h2_2 = { kind: "infographic", infoType: "flow" };
    plan.h2_4 = { kind: "infographic", infoType: "checklist" };
  } else if (intent === "compare") {
    plan.h2_2 = { kind: "infographic", infoType: "compare" };
    plan.h2_3 = { kind: "infographic", infoType: "matrix" };
    plan.h2_4 = { kind: "photo" };
  } else if (intent === "price") {
    plan.h2_2 = { kind: "infographic", infoType: "compare" };
    plan.h2_4 = { kind: "infographic", infoType: "checklist" };
  } else if (intent === "risk") {
    plan.h2_2 = { kind: "infographic", infoType: "riskmap" };
    plan.h2_3 = { kind: "infographic", infoType: "scenario" };
    plan.h2_4 = { kind: "photo" };
  } else if (intent === "review") {
    plan.h2_2 = { kind: "infographic", infoType: "proscons" };
    plan.h2_4 = { kind: "infographic", infoType: "matrix" };
  }

  return plan;
}
