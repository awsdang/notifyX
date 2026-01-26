import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { createTemplateSchema, updateTemplateSchema } from '../schemas/templates';
import { sendSuccess, AppError } from '../utils/response';

export const createTemplate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = createTemplateSchema.parse(req.body);

        const template = await prisma.notificationTemplate.create({
            data: {
                appId: data.appId,
                type: data.type,
                eventName: data.eventName,
                language: data.language,
                title: data.title,
                subtitle: data.subtitle,
                body: data.body,
                image: data.image,
                variables: data.variables,
            },
        });

        sendSuccess(res, template, 201);
    } catch (error) {
        next(error);
    }
};

export const getTemplates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { appId } = req.query;
        const templates = await prisma.notificationTemplate.findMany({
            where: appId ? { appId: String(appId) } : undefined,
            orderBy: { createdAt: 'desc' },
        });
        sendSuccess(res, templates);
    } catch (error) {
        next(error);
    }
};

export const getTemplate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const template = await prisma.notificationTemplate.findUnique({ where: { id: String(id) } });
        if (!template) {
            throw new AppError(404, 'Template not found');
        }
        sendSuccess(res, template);
    } catch (error) {
        next(error);
    }
};

export const updateTemplate = async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    try {
        const data = updateTemplateSchema.parse(req.body);
        const template = await prisma.notificationTemplate.update({
            where: { id: String(id) },
            data,
        });
        sendSuccess(res, template);
    } catch (error) {
        next(error);
    }
};

export const deleteTemplate = async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    try {
        await prisma.notificationTemplate.delete({ where: { id: String(id) } });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
