import Joi from "joi";

export const employeeInsertSchema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    departmentId: Joi.string().uuid().required(),
})