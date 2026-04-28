import { pool } from '../config/db.js';

export const LoanModel = {
  async createLoan(book_id, member_id, due_date) {
    const client = await pool.connect(); // Menggunakan client untuk transaksi
    try {
      await client.query('BEGIN'); // Mulai transaksi database

      // 1. Cek ketersediaan buku
      const bookCheck = await client.query('SELECT available_copies FROM books WHERE id = $1', [book_id]);
      if (bookCheck.rows[0].available_copies <= 0) {
        throw new Error('Buku sedang tidak tersedia (stok habis).');
      }

      // 2. Kurangi stok buku
      await client.query('UPDATE books SET available_copies = available_copies - 1 WHERE id = $1', [book_id]);

      // 3. Catat transaksi peminjaman
      const loanQuery = `
        INSERT INTO loans (book_id, member_id, due_date) 
        VALUES ($1, $2, $3) RETURNING *
      `;
      const result = await client.query(loanQuery, [book_id, member_id, due_date]);

      await client.query('COMMIT'); // Simpan semua perubahan
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK'); // Batalkan jika ada error
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

  // FUNGSI BARU: Mengambil Top 3 Peminjam
  async getTopBorrowers() {
    const query = `
      WITH MemberStats AS (
        SELECT
          member_id,
          COUNT(id) as total_pinjaman,
          MAX(loan_date) as pinjaman_terakhir
        FROM loans
        GROUP BY member_id
      ),
      FavoriteBook AS (
        SELECT DISTINCT ON (member_id)
          member_id,
          book_id,
          COUNT(id) as freq
        FROM loans
        GROUP BY member_id, book_id
        ORDER BY member_id, freq DESC
      )
      SELECT
        m.id,
        m.full_name,
        m.email,
        m.member_type,
        m.joined_at,
        CAST(ms.total_pinjaman AS INTEGER) as total_pinjaman,
        b.title as buku_favorit,
        ms.pinjaman_terakhir
      FROM MemberStats ms
      JOIN members m ON ms.member_id = m.id
      JOIN FavoriteBook fb ON ms.member_id = fb.member_id
      JOIN books b ON fb.book_id = b.id
      ORDER BY ms.total_pinjaman DESC
      LIMIT 3;
    `;
    const result = await pool.query(query);
    return result.rows;
  }
};