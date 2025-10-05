import Joi from "joi";

export const leaveRequestInsertSchema = Joi.object({
    employeeId: Joi.string().uuid().required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
});
