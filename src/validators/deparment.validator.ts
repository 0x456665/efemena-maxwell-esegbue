import Joi from "joi";

export const deparmentInsertSchema = Joi.object({
    name: Joi.string().required(),
});
