import 'cypress-axe';

// Custom accessibility testing commands
declare global {
  namespace Cypress {
    interface Chainable {
      checkA11y(
        context?: string | Node,
        options?: any,
        violationCallback?: (violations: any[]) => void,
        skipFailures?: boolean
      ): Chainable<void>
      injectAxe(): Chainable<void>
      configureAxe(options?: any): Chainable<void>
      checkColorContrast(): Chainable<void>
      checkKeyboardNavigation(): Chainable<void>
      checkScreenReaderSupport(): Chainable<void>
      checkFocusManagement(): Chainable<void>
    }
  }
}

// Enhanced accessibility checking with custom rules
Cypress.Commands.add('checkA11y', (context, options, violationCallback, skipFailures) => {
  const defaultOptions = {
    rules: {
      'color-contrast': { enabled: true },
      'keyboard-navigation': { enabled: true },
      'focus-management': { enabled: true },
      'aria-labels': { enabled: true },
      'semantic-markup': { enabled: true },
      'image-alt': { enabled: true },
      'form-labels': { enabled: true },
      'heading-order': { enabled: true },
      'landmark-roles': { enabled: true },
      'skip-link': { enabled: true }
    },
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']
  };

  const mergedOptions = { ...defaultOptions, ...options };
  
  cy.checkA11y(context, mergedOptions, (violations) => {
    if (violations.length > 0) {
      cy.task('log', {
        message: 'Accessibility violations found:',
        violations: violations.map(violation => ({
          id: violation.id,
          impact: violation.impact,
          description: violation.description,
          nodes: violation.nodes.length,
          helpUrl: violation.helpUrl
        }))
      });
    }
    
    if (violationCallback) {
      violationCallback(violations);
    }
  }, skipFailures);
});

// Check color contrast specifically
Cypress.Commands.add('checkColorContrast', () => {
  cy.checkA11y(null, {
    rules: {
      'color-contrast': { enabled: true }
    }
  });
});

// Test keyboard navigation
Cypress.Commands.add('checkKeyboardNavigation', () => {
  // Test tab navigation
  cy.get('body').tab();
  cy.focused().should('be.visible');
  
  // Test all interactive elements are reachable
  cy.get('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    .each(($el) => {
      cy.wrap($el).focus();
      cy.focused().should('have.attr', 'data-testid').or('have.attr', 'id').or('have.attr', 'aria-label');
    });
  
  // Test escape key functionality
  cy.get('body').type('{esc}');
  
  // Test enter key on buttons
  cy.get('button').first().focus().type('{enter}');
});

// Test screen reader support
Cypress.Commands.add('checkScreenReaderSupport', () => {
  // Check for proper ARIA labels
  cy.get('[role="button"], [role="link"], [role="textbox"]')
    .should('have.attr', 'aria-label')
    .or('have.attr', 'aria-labelledby')
    .or('have.attr', 'aria-describedby');
  
  // Check for live regions
  cy.get('[aria-live]').should('exist');
  
  // Check for proper heading structure
  cy.get('h1').should('have.length', 1);
  cy.get('h1, h2, h3, h4, h5, h6').each(($heading, index, $headings) => {
    const currentLevel = parseInt($heading.prop('tagName').charAt(1));
    if (index > 0) {
      const previousLevel = parseInt($headings.eq(index - 1).prop('tagName').charAt(1));
      expect(currentLevel).to.be.at.most(previousLevel + 1);
    }
  });
  
  // Check for skip links
  cy.get('a[href="#main"], a[href="#content"]').should('exist');
});

// Test focus management
Cypress.Commands.add('checkFocusManagement', () => {
  // Test modal focus trapping
  cy.get('[role="dialog"]').then(($modal) => {
    if ($modal.length > 0) {
      // Focus should be trapped within modal
      cy.get('[role="dialog"] button, [role="dialog"] a, [role="dialog"] input')
        .first()
        .should('be.focused');
      
      // Tab should cycle within modal
      cy.get('body').tab();
      cy.focused().should('be.within', '[role="dialog"]');
    }
  });
  
  // Test focus indicators
  cy.get('button, a, input').each(($el) => {
    cy.wrap($el).focus();
    cy.focused().should('have.css', 'outline').and('not.equal', 'none');
  });
  
  // Test focus restoration after modal close
  cy.get('[data-testid="open-modal-button"]').then(($button) => {
    if ($button.length > 0) {
      cy.wrap($button).click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.get('[data-testid="close-modal-button"]').click();
      cy.get('[role="dialog"]').should('not.exist');
      cy.get('[data-testid="open-modal-button"]').should('be.focused');
    }
  });
});