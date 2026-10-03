const Firebird = require('node-firebird');

const options = {
  host: '127.0.0.1',
  port: 3050,
  database: 'C:\\Users\\xsoft\\OneDrive\\Desktop\\shopapp\\shop.fdb',
  user: 'SYSDBA',
  password: 'masterkey',
  lowercase_keys: false,
  pageSize: 4096
};

console.log('Setting up database...');

// Try to create database first
Firebird.create(options, (err, db) => {
  if (err) {
    console.log('Database may already exist, trying to connect...');
    Firebird.attach(options, (err2, db2) => {
      if (err2) {
        console.error('❌ Cannot connect to Firebird:', err2.message);
        console.log('\nMake sure Firebird is running. Check with:');
        console.log('  sc query FirebirdServerDefaultInstance');
        process.exit(1);
      }
      createTables(db2);
    });
    return;
  }
  console.log('✅ Database created!');
  createTables(db);
});

function createTables(db) {
  // Create ITEMS table
  db.query(`
    CREATE TABLE ITEMS (
      ID        INTEGER NOT NULL PRIMARY KEY,
      NAME      VARCHAR(200) NOT NULL,
      SKU       VARCHAR(50),
      CATEGORY  VARCHAR(100),
      STOCK     INTEGER DEFAULT 0,
      PRICE     DECIMAL(10,2) DEFAULT 0.00,
      DESCRIPTION VARCHAR(500),
      CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err && err.message && err.message.toLowerCase().includes('already exist')) {
      console.log('Table ITEMS already exists, skipping...');
      createSequence(db);
      return;
    }
    if (err) {
      console.error('Error creating table:', err.message);
      db.detach();
      return;
    }
    console.log('✅ Table ITEMS created!');
    createSequence(db);
  });
}

function createSequence(db) {
  db.query('CREATE SEQUENCE ITEMS_SEQ START WITH 1', (err) => {
    if (err && err.message && err.message.toLowerCase().includes('already exist')) {
      console.log('Sequence already exists, skipping...');
      insertSample(db);
      return;
    }
    if (err) {
      console.error('Error creating sequence:', err.message);
      db.detach();
      return;
    }
    console.log('✅ Sequence created!');
    insertSample(db);
  });
}

function insertSample(db) {
  const samples = [
    ['Wireless Headphones', 'WH-001', 'Electronics', 24, 2999.00, 'Over-ear noise cancelling headphones'],
    ['Organic Green Tea',   'GT-042', 'Beverages',   50, 349.00,  'Premium loose leaf green tea 100g'],
    ['Leather Wallet',      'LW-017', 'Accessories',  0, 1199.00, 'Slim bifold genuine leather wallet'],
    ['Running Shoes',       'RS-088', 'Footwear',    18, 4599.00, 'Lightweight mesh running shoes'],
    ['Desk Lamp',           'DL-003', 'Home',        12, 899.00,  'LED desk lamp adjustable color temp'],
  ];

  let done = 0;
  samples.forEach(([name, sku, cat, stock, price, desc]) => {
    db.query(
      `INSERT INTO ITEMS (ID, NAME, SKU, CATEGORY, STOCK, PRICE, DESCRIPTION)
       VALUES (NEXT VALUE FOR ITEMS_SEQ, ?, ?, ?, ?, ?, ?)`,
      [name, sku, cat, stock, price, desc],
      (err) => {
        if (err) console.log(`  Skipping sample "${name}" (may already exist)`);
        else console.log(`  ✅ Added sample: ${name}`);
        done++;
        if (done === samples.length) {
          db.detach();
          console.log('\n✅ Setup complete!');
          console.log('👉 Now run: node server.js');
        }
      }
    );
  });
}