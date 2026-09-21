import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TermsView, PrivacyView } from './LegalViews';
import { CURRENT_TERMS_VERSION } from '@/constants/legal';

describe('LegalViews', () => {
  it('TermsView renders the terms and conditions content with the current version', () => {
    render(
      <MemoryRouter>
        <TermsView />
      </MemoryRouter>
    );

    expect(screen.getByText('Términos y condiciones')).toBeInTheDocument();
    expect(screen.getByText(`Versión ${CURRENT_TERMS_VERSION}`)).toBeInTheDocument();
    expect(
      screen.getByText(/Estos Términos y Condiciones regulan el uso de la aplicación La Banda/)
    ).toBeInTheDocument();
  });

  it('PrivacyView renders the privacy policy content with the current version', () => {
    render(
      <MemoryRouter>
        <PrivacyView />
      </MemoryRouter>
    );

    expect(screen.getByText('Política de privacidad')).toBeInTheDocument();
    expect(screen.getByText(`Versión ${CURRENT_TERMS_VERSION}`)).toBeInTheDocument();
    expect(
      screen.getByText(/Tratamos tus datos personales/)
    ).toBeInTheDocument();
  });
});
