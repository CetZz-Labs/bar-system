import { describe, it, expect } from 'vitest';
import { onboardingSchema } from './user';

describe('onboardingSchema', () => {
    it('should accept a valid full name and birthdate', () => {
        const result = onboardingSchema.safeParse({
            fullName: 'Maria Garcia',
            birthdate: '2000-01-15',
        });
        expect(result.success).toBe(true);
    });

    it('should reject a single word name', () => {
        const result = onboardingSchema.safeParse({
            fullName: 'Maria',
            birthdate: '2000-01-15',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const fullNameError = result.error.issues.find(
                (i) => i.path.includes('fullName')
            );
            expect(fullNameError?.message).toBe('Ingresá nombre y apellido');
        }
    });

    it('should reject a name longer than 50 characters', () => {
        const longName = 'A'.repeat(49) + ' B';
        const result = onboardingSchema.safeParse({
            fullName: longName,
            birthdate: '2000-01-15',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const fullNameError = result.error.issues.find(
                (i) => i.path.includes('fullName')
            );
            expect(fullNameError?.message).toBe('Máximo 50 caracteres');
        }
    });

    it('should accept a name with exactly 50 characters', () => {
        const name50 = 'A'.repeat(48) + ' B';
        const result = onboardingSchema.safeParse({
            fullName: name50,
            birthdate: '2000-01-15',
        });
        expect(result.success).toBe(true);
    });

    it('should reject an empty full name', () => {
        const result = onboardingSchema.safeParse({
            fullName: '',
            birthdate: '2000-01-15',
        });
        expect(result.success).toBe(false);
    });

    it('should reject an empty birthdate', () => {
        const result = onboardingSchema.safeParse({
            fullName: 'Maria Garcia',
            birthdate: '',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const birthdateError = result.error.issues.find(
                (i) => i.path.includes('birthdate')
            );
            expect(birthdateError?.message).toBe('La fecha de nacimiento es requerida');
        }
    });

    it('should accept a name with more than 2 words', () => {
        const result = onboardingSchema.safeParse({
            fullName: 'Maria Jose Garcia',
            birthdate: '2000-01-15',
        });
        expect(result.success).toBe(true);
    });

    it('should reject whitespace-only name', () => {
        const result = onboardingSchema.safeParse({
            fullName: '   ',
            birthdate: '2000-01-15',
        });
        expect(result.success).toBe(false);
    });
});
