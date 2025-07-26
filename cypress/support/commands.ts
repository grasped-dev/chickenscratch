/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      login(email?: string, password?: string): Chainable<void>
      uploadTestImage(filename?: string): Chainable<void>
      waitForProcessingComplete(): Chainable<void>
      checkAccessibility(): Chainable<void>
      mockApiResponses(): Chainable<void>
    }
  }
}

// Custom command for user login
Cypress.Commands.add('login', (email = 'test@example.com', password = 'testpassword123') => {
  cy.visit('/login')
  cy.get('[data-testid="email-input"]').type(email)
  cy.get('[data-testid="password-input"]').type(password)
  cy.get('[data-testid="login-button"]').click()
  cy.wait('@login')
  cy.url().should('not.include', '/login')
})

// Custom command for uploading test images
Cypress.Commands.add('uploadTestImage', (filename = 'test-notes.jpg') => {
  cy.fixture(filename, 'base64').then(fileContent => {
    cy.get('[data-testid="file-upload-dropzone"]').selectFile({
      contents: Cypress.Buffer.from(fileContent, 'base64'),
      fileName: filename,
      mimeType: 'image/jpeg'
    }, { action: 'drag-drop' })
  })
})

// Custom command to wait for processing completion
Cypress.Commands.add('waitForProcessingComplete', () => {
  cy.get('[data-testid="processing-status"]', { timeout: 30000 })
    .should('contain', 'Processing complete')
  cy.get('[data-testid="results-section"]').should('be.visible')
})

// Custom command for accessibility testing
Cypress.Commands.add('checkAccessibility', () => {
  cy.injectAxe()
  cy.checkA11y(null, {
    rules: {
      'color-contrast': { enabled: true },
      'keyboard-navigation': { enabled: true },
      'focus-management': { enabled: true }
    }
  })
})

// Custom command to mock API responses
Cypress.Commands.add('mockApiResponses', () => {
  cy.intercept('POST', '/api/auth/register', { fixture: 'auth/register-success.json' }).as('register')
  cy.intercept('POST', '/api/projects', { fixture: 'projects/create-success.json' }).as('createProject')
  cy.intercept('GET', '/api/projects/*', { fixture: 'projects/project-detail.json' }).as('getProject')
  cy.intercept('PUT', '/api/projects/*', { fixture: 'projects/update-success.json' }).as('updateProject')
  cy.intercept('DELETE', '/api/projects/*', { statusCode: 204 }).as('deleteProject')
  cy.intercept('POST', '/api/export/pdf', { fixture: 'export/pdf-success.json' }).as('exportPdf')
  cy.intercept('POST', '/api/export/csv', { fixture: 'export/csv-success.json' }).as('exportCsv')
})