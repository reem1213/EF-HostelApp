import { z } from "zod";

import { categoryLabel } from "./domain/types";

export const expenseCategorySchema = z.enum(Object.keys(categoryLabel) as [keyof typeof categoryLabel, ...(keyof typeof categoryLabel)[]]);
