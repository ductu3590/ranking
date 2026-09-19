'use client';

import { useEffect, useRef } from 'react';

function getStepState(step, currentStep, highestAllowedStep) {
  if (step.id === currentStep) return 'current';
  if (step.id < currentStep) return 'done';
  if (step.id <= highestAllowedStep) return 'available';
  return 'locked';
}

export default function SetupStepper({ steps, currentStep, highestAllowedStep, onStepChange, focusActive }) {
  const activeRef = useRef(null);

  useEffect(() => {
    if (focusActive && activeRef.current) {
      activeRef.current.focus();
    }
  }, [currentStep, focusActive]);

  return (
    <nav className="setup-stepper" aria-label="Các bước thiết lập giải">
      <ol className="setup-stepper__list">
        {steps.map((step) => {
          const state = getStepState(step, currentStep, highestAllowedStep);
          const locked = state === 'locked';
          return (
            <li className={`setup-stepper__item is-${state}`} key={step.key}>
              <button
                ref={step.id === currentStep ? activeRef : null}
                type="button"
                className="setup-stepper__button"
                aria-current={step.id === currentStep ? 'step' : undefined}
                aria-disabled={locked ? 'true' : undefined}
                disabled={locked}
                onClick={() => onStepChange(step.id)}
              >
                <span className="setup-stepper__index" aria-hidden="true">{step.id}</span>
                <span className="setup-stepper__copy">
                  <span className="setup-stepper__label">{step.label}</span>
                  <span className="setup-stepper__description">{step.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
