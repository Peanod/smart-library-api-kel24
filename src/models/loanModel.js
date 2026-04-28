import { pool } from '../config/db.js';

export const LoanModel = {
  async createLoan(book_id, member_id, due_date) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const bookCheck = await client.query('SELECT available_copies FROM books WHERE id = $1', [book_id]);
      if (bookCheck.rows[0].available_copies <= 0) {
        throw new Error('Buku sedang tidak tersedia (stok habis).');
      }

      await client.query('UPDATE books SET available_copies = available_copies - 1 WHERE id = $1', [book_id]);

      const loanQuery = `
        INSERT INTO loans (book_id, member_id, due_date) 
        VALUES ($1, $2, $3) RETURNING *
      `;
      const result = await client.query(loanQuery, [book_id, member_id, due_date]);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getAllLoans() {
    const query = `
      SELECT l.*, b.title as book_title, m.full_name as member_name 
      FROM loans l
      JOIN books b ON l.book_id = b.id
      JOIN members m ON l.member_id = m.id
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // FUNGSI BARU: Mengambil Top 3 Peminjam (Sesuai output JSON yang diminta)
  async getTopBorrowers() {
    const query = `
      WITH MemberStats AS (
        SELECT
          member_id,
          COUNT(id) as total_loans,
          MAX(loan_date) as last_loan_date
        FROM loans
        GROUP BY member_id
      ),
      BookFreq AS (
        SELECT
          member_id,
          book_id,
          COUNT(id) as times_borrowed
        FROM loans
        GROUP BY member_id, book_id
      ),
      FavBook AS (
        SELECT DISTINCT ON (bf.member_id)
          bf.member_id,
          b.title,
          bf.times_borrowed
        FROM BookFreq bf
        JOIN books b ON bf.book_id = b.id
        ORDER BY bf.member_id, bf.times_borrowed DESC
      )
      SELECT
        m.id as member_id,
        m.full_name,
        m.email,
        m.member_type,
        CAST(ms.total_loans AS INTEGER) as total_loans,
        ms.last_loan_date,
        json_build_object(
          'title', fb.title,
          'times_borrowed', CAST(fb.times_borrowed AS INTEGER)
        ) as favorite_book
      FROM MemberStats ms
      JOIN members m ON ms.member_id = m.id
      JOIN FavBook fb ON ms.member_id = fb.member_id
      ORDER BY ms.total_loans DESC
      LIMIT 3;
    `;
    const result = await pool.query(query);
    return result.rows;
  }
};