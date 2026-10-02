import "server-only";

import { CaseSmartForm } from "../models/CaseSmartForm";
import type { StoredForm } from "./form-service";

/** Forms on a case, for a caller that has already passed `getAccessibleCase`. */
export async function listClientForms(caseId: string): Promise<StoredForm[]> {
  return (await CaseSmartForm.find({ case: caseId }).sort({ templateKey: 1 }).lean()) as unknown as StoredForm[];
}
