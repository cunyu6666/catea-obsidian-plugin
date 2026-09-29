/**
 * [WHO]: Provides askUserQuestionTool, formatAskUserQuestionResult, parseAskUserQuestion
 * [FROM]: Depends on ./types
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/ask-user-question.ts - declares, validates and formats the AskUserQuestion tool; 1-4 questions, 2-4 unique option labels, headers clipped to 12 chars
 */
import type { AskUserQuestion, AskUserQuestionAnswer } from './types'

export const askUserQuestionTool = {
  name: 'AskUserQuestion',
  description:
    'Ask the user for missing information or a preference during execution. Use only when their answer is needed to continue. Offer 2–4 concise choices per question; the user can also write a custom answer. Do not ask again about information the user already provided.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The complete, specific question.' },
            header: { type: 'string', description: 'Short label, at most 12 characters.' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'Concise choice label.' },
                  description: { type: 'string', description: 'What this choice means.' },
                  preview: {
                    type: 'string',
                    description: 'Optional text preview for comparing choices.',
                  },
                },
                required: ['label', 'description'],
              },
            },
            multiSelect: { type: 'boolean', description: 'Allow more than one choice.' },
          },
          required: ['question', 'header', 'options'],
        },
      },
    },
    required: ['questions'],
  },
}

export function parseAskUserQuestion(args: Record<string, unknown>): AskUserQuestion[] {
  if (!Array.isArray(args.questions) || args.questions.length < 1 || args.questions.length > 4)
    throw new Error('AskUserQuestion requires 1–4 questions.')
  const questions = args.questions.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid question.')
    const row = value as Record<string, unknown>
    if (
      typeof row.question !== 'string' ||
      !row.question.trim() ||
      typeof row.header !== 'string' ||
      !Array.isArray(row.options) ||
      row.options.length < 2 ||
      row.options.length > 4
    )
      throw new Error('Invalid question or options.')
    const options = row.options.map((option: unknown) => {
      if (!option || typeof option !== 'object') throw new Error('Invalid option.')
      const entry = option as Record<string, unknown>
      if (
        typeof entry.label !== 'string' ||
        !entry.label.trim() ||
        typeof entry.description !== 'string'
      )
        throw new Error('Invalid option label or description.')
      return {
        label: entry.label.trim(),
        description: entry.description,
        ...(typeof entry.preview === 'string' ? { preview: entry.preview } : {}),
      }
    })
    if (new Set(options.map((option) => option.label)).size !== options.length)
      throw new Error('Option labels must be unique within each question.')
    return {
      question: row.question.trim(),
      header: row.header.slice(0, 12),
      options,
      multiSelect: row.multiSelect === true,
    }
  })
  if (new Set(questions.map((question) => question.question)).size !== questions.length)
    throw new Error('Question texts must be unique.')
  return questions
}

export function formatAskUserQuestionResult(answers: AskUserQuestionAnswer): string {
  return `User has answered your questions: ${Object.entries(answers)
    .map(([question, answer]) => `${JSON.stringify(question)}=${JSON.stringify(answer)}`)
    .join(', ')}. Continue using these answers.`
}
