// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Global test setup
beforeEach(() => {
  // Clear local storage and cookies before each test
  cy.clearLocalStorage()
  cy.clearCookies()
  
  // Set up API interceptors for consistent testing
  cy.intercept('POST', '/api/auth/login', { fixture: 'auth/login-success.json' }).as('login')
  cy.intercept('GET', '/api/projects', { fixture: 'projects/projects-list.json' }).as('getProjects')
  cy.intercept('POST', '/api/upload', { fixture: 'upload/upload-success.json' }).as('uploadFiles')
  cy.intercept('GET', '/api/processing/status/*', { fixture: 'processing/status-complete.json' }).as('getProcessingStatus')
})

// Handle uncaught exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing the test on unhandled promise rejections
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false
  }
  return true
})