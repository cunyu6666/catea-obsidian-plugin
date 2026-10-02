import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Icon } from './Icon'

export interface ApprovalCardQuestion {
  id: string
  title: string
  options: Array<{ value: string; label: string; description?: string; preview?: string }>
  multiple?: boolean
  allowCustom?: boolean
  customPlaceholder?: string
}

export interface ApprovalCardAnswer {
  selected: string[]
  custom: string
}
export type ApprovalCardAnswers = Record<string, ApprovalCardAnswer>
export type ApprovalCardStatus = 'pending' | 'submitting' | 'answered'

/** Question surface ported from BeUI's MIT-licensed Approval Card. */
export function ApprovalCard({
  questions,
  onSubmit,
  onDismiss,
  status = 'pending',
  result = 'Response submitted',
  submitLabel = 'Submit response',
  nextLabel = 'Next question',
  previousLabel = 'Previous question',
  dismissLabel = 'Dismiss',
  previewLabel = 'Preview',
  progressLabel,
}: {
  questions: ApprovalCardQuestion[]
  onSubmit?: (answers: ApprovalCardAnswers) => void
  onDismiss?: () => void
  status?: ApprovalCardStatus
  result?: string
  submitLabel?: string
  nextLabel?: string
  previousLabel?: string
  dismissLabel?: string
  previewLabel?: string
  progressLabel?: (current: number, total: number) => string
}) {
  const [answers, setAnswers] = useState<ApprovalCardAnswers>({})
  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const advanceTimer = useRef<number | undefined>(undefined)
  const reduceMotion = useReducedMotion()
  const question = questions[step]
  useEffect(
    () => () => {
      if (advanceTimer.current !== undefined) window.clearTimeout(advanceTimer.current)
    },
    [],
  )
  if (!question) return null
  const answer = answers[question.id] || { selected: [], custom: '' }
  const valid = answer.selected.length > 0 || Boolean(answer.custom.trim())
  const update = (next: ApprovalCardAnswer) => {
    if (advanceTimer.current !== undefined) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = undefined
    setAnswers((current) => ({ ...current, [question.id]: next }))
  }
  const move = (next: number) => {
    if (advanceTimer.current !== undefined) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = undefined
    setPreview(null)
    setStep(next)
  }
  const continueQuestion = () =>
    step < questions.length - 1 ? move(step + 1) : onSubmit?.(answers)
  const choose = (value: string) => {
    const next = question.multiple
      ? answer.selected.includes(value)
        ? answer.selected.filter((item) => item !== value)
        : [...answer.selected, value]
      : [value]
    update({ selected: next, custom: question.multiple ? answer.custom : '' })
    if (!question.multiple && step < questions.length - 1) {
      if (advanceTimer.current !== undefined) window.clearTimeout(advanceTimer.current)
      advanceTimer.current = window.setTimeout(() => move(step + 1), 240)
    }
  }

  return (
    <section
      className="anno-approval-card"
      data-state={status}
      aria-busy={status === 'submitting'}
      onKeyDown={(event) => {
        if (
          event.key !== 'Enter' ||
          event.nativeEvent.isComposing ||
          event.repeat ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          !(event.target instanceof HTMLInputElement)
        )
          return
        event.preventDefault()
        event.stopPropagation()
        if (status === 'pending' && valid) continueQuestion()
      }}
    >
      <span className="catea-sr-only">{status === 'answered' ? result : question.title}</span>
      <span className="anno-approval-card__icon" aria-hidden="true">
        <Icon name={status === 'answered' ? 'check' : 'question'} size={16} />
      </span>
      <div className="anno-approval-card__body">
        <div className="anno-approval-card__top">
          <h3>{status === 'answered' ? result : question.title}</h3>
          {status !== 'answered' && questions.length > 1 && (
            <span>
              {step + 1}/{questions.length}
            </span>
          )}
          {onDismiss && status === 'pending' && (
            <button type="button" onClick={onDismiss}>
              <span className="catea-sr-only">{dismissLabel}</span>
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        {status !== 'answered' && (
          <>
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={question.id}
                initial={{ opacity: 0, x: reduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduceMotion ? 0 : -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
              >
                <div className="anno-approval-card__options">
                  {question.options.map((option) => (
                    <div className="anno-approval-card__option" key={option.value}>
                      <label
                        title={option.description}
                        data-selected={answer.selected.includes(option.value)}
                      >
                        <input
                          type={question.multiple ? 'checkbox' : 'radio'}
                          name={`approval-${question.id}`}
                          checked={answer.selected.includes(option.value)}
                          disabled={status === 'submitting'}
                          onChange={() => choose(option.value)}
                        />
                        <i className="anno-approval-card__control" aria-hidden="true" />
                        <span>{option.label}</span>
                      </label>
                      {option.preview && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreview((current) =>
                              current === option.value ? null : option.value,
                            )
                          }
                        >
                          {previewLabel}
                          <span className="catea-sr-only">{` ${option.label}`}</span>
                        </button>
                      )}
                    </div>
                  ))}
                  {preview && (
                    <pre className="anno-approval-card__preview">
                      {question.options.find((option) => option.value === preview)?.preview}
                    </pre>
                  )}
                  {question.allowCustom && (
                    <label className="catea-field-label">
                      <span className="catea-sr-only">
                        {question.customPlaceholder || 'Add another response'}
                      </span>
                      <input
                        className="anno-approval-card__custom"
                        value={answer.custom}
                        disabled={status === 'submitting'}
                        onChange={(event) =>
                          update({
                            selected: question.multiple ? answer.selected : [],
                            custom: event.target.value,
                          })
                        }
                        placeholder={question.customPlaceholder || 'Add another response…'}
                      />
                    </label>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="anno-approval-card__footer">
              {questions.length > 1 && (
                <>
                  <button
                    type="button"
                    className="anno-approval-card__previous"
                    disabled={step === 0 || status === 'submitting'}
                    onClick={() => move(step - 1)}
                  >
                    <span className="catea-sr-only">{previousLabel}</span>
                    <Icon name="arrow-left" size={15} />
                  </button>
                  <span className="anno-approval-card__dots">
                    <span className="catea-sr-only">
                      {progressLabel?.(step + 1, questions.length) ||
                        `Question ${step + 1} of ${questions.length}`}
                    </span>
                    {questions.map((item, index) => (
                      <i key={item.id} className={index === step ? 'is-active' : ''} />
                    ))}
                  </span>
                </>
              )}
              <button
                type="button"
                className={`anno-approval-card__next ${step === questions.length - 1 ? 'is-final' : ''}`}
                disabled={!valid || status === 'submitting'}
                onClick={continueQuestion}
              >
                {step !== questions.length - 1 && (
                  <span className="catea-sr-only">{nextLabel}</span>
                )}
                {step === questions.length - 1 && <span>{submitLabel}</span>}
                <Icon name="arrow-right" size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
