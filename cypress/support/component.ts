// Import commands.js using ES2015 syntax:
import './commands'
import '@testing-library/cypress/add-commands'

// Component testing setup
import { mount } from 'cypress/react18'

declare global {
  namespace Cypress {
    interface Chainable {
      mount: typeof mount
    }
  }
}

Cypress.Commands.add('mount', mount)