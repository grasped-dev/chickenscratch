import { BaseRepository } from './BaseRepository.js';
import type { 
  User, 
  CreateUserInput, 
  UpdateUserInput,
  UserPreferences 
} from 'chicken-scratch-shared';

export class UserRepository extends BaseRepository<User, CreateUserInput, UpdateUserInput> {
  protected tableName = 'users';
  protected primaryKey = 'id';

  // Find user by email
  async findByEmail(email: string): Promise<User | null> {
    const users = await this.findAll({ where: { email } });
    return users.length > 0 ? users[0] : null;
  }

  // Check if email exists
  async emailExists(email: string): Promise<boolean> {
    const count = await this.count({ email });
    return count > 0;
  }

  // Update user preferences
  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user) {
      return null;
    }

    const updatedPreferences = {
      ...user.preferences,
      ...preferences
    };

    return this.updateById(userId, { preferences: updatedPreferences });
  }

  protected mapRowToEntity(row: any): User {
    const defaultPreferences: UserPreferences = {
      defaultClusteringMethod: 'hybrid',
      autoProcessing: true,
      exportFormat: 'pdf',
      theme: 'light'
    };

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      preferences: { ...defaultPreferences, ...row.preferences }
    };
  }

  // Override create to handle snake_case conversion
  async create(data: CreateUserInput): Promise<User> {
    const dbData = {
      email: data.email,
      name: data.name,
      password_hash: data.passwordHash,
      preferences: data.preferences || {}
    };

    const result = await this.executeQuery(
      `INSERT INTO ${this.tableName} (email, name, password_hash, preferences)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [dbData.email, dbData.name, dbData.password_hash, JSON.stringify(dbData.preferences)]
    );

    return this.mapRowToEntity(result.rows[0]);
  }

  // Override updateById to handle snake_case conversion
  async updateById(id: string, data: Partial<UpdateUserInput>): Promise<User | null> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (data.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.preferences !== undefined) {
      updateFields.push(`preferences = $${paramIndex++}`);
      values.push(JSON.stringify(data.preferences));
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateFields.push(`updated_at = NOW()`);

    const query = `
      UPDATE ${this.tableName}
      SET ${updateFields.join(', ')}
      WHERE ${this.primaryKey} = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToEntity(result.rows[0]);
  }

  // Update user password
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const query = `
      UPDATE ${this.tableName}
      SET password_hash = $2, updated_at = NOW()
      WHERE ${this.primaryKey} = $1
    `;

    await this.executeQuery(query, [userId, passwordHash]);
  }
}