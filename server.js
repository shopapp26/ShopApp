const express = require('express');
console.log("Running from:", __filename);
const Firebird = require('node-firebird');
const cors = require('cors');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const config = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'config.json'),
        'utf8'
    )
);
// ── App settings ────────────────────────────────────────────────
// Send selected settings from config.json to the frontend
app.get('/api/config', (req, res) => {

    res.json({
        allowNoStock:
            String(config.ALLOWNOSTOCK).toUpperCase() === 'YES'
    });

});
// ── Firebird config ──────────────────────────────────────────────
const DB_OPTIONS = {
    host: config.SERVERIP,
    port: 3050,
    database: config.DBPATHNAME,
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true,
    role: null,
    encoding: 'NONE'
};

// ── Helper ───────────────────────────────────────────────────────
function getDb(callback) {
    Firebird.attach(DB_OPTIONS, (err, db) => {
        if (err) return callback(err);
        callback(null, db);
    });
}
function crypt(txtToCrypt) {
    let outCrypted = "";

    for (let i = 0; i < txtToCrypt.length; i++) {
        const x = String.fromCharCode(
            255 - txtToCrypt.charCodeAt(i)
        );

        outCrypted += x;
    }

    return outCrypted;
}
// ── Auth ─────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {

    const { username, password } = req.body;

    const encryptedPassword = crypt(password);
    console.log("Password entered:", password);

    for (let i = 0; i < encryptedPassword.length; i++) {
        console.log(
            i,
            encryptedPassword.charCodeAt(i)
        );
    }
    console.log("Username:", username);
    console.log("Encrypted password:", encryptedPassword);

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        db.query(
            "SELECT * FROM SALESEMPMAST WHERE NAME = ? AND INUSE = 'T'", [username],
            (err, rows) => {
                console.log(rows[0]);
                if (rows.length > 0) {
                    const dbPwd = rows[0].pwd;
                    for (let i = 0; i < dbPwd.length; i++) {
                        console.log("DB", i, dbPwd.charCodeAt(i));
                    }
                }
                console.log("Password typed:", encryptedPassword);

                db.detach();
                if (rows.length > 0 && rows[0].pwd === encryptedPassword) {

                    return res.json({

                        success: true,

                        smcode: rows[0].smcode

                    });

                }

                return res.status(401).json({
                    success: false,
                    message: 'Wrong username or password'
                });
            }
        );
    });

});

app.get('/api/users', (req, res) => {

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        db.query(

            "SELECT NAME FROM SALESEMPMAST WHERE INUSE = 'T' ORDER BY NAME",
            [],

            (err, rows) => {

                db.detach();

                if (err) {
                    return res.status(500).json({
                        error: err.message
                    });
                }

                res.json(rows);

            }

        );

    });

});


// ── Add item ──────────────────────────────────────────────────────
app.get('/api/price/:itemid', (req, res) => {

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        db.query(

            `SELECT RATE FROM PRICEDET WHERE PLCODE = ? AND ITEMID = ?`,

            [
                config.PRICELIST,
                req.params.itemid
            ],

            (err, rows) => {

                db.detach();

                console.log("PRICE ROWS:", rows);

                if (err) {
                    return res.status(500).json({
                        error: err.message
                    });
                }

                if (!rows || rows.length === 0) {
                    return res.json({
                        rate: 0
                    });
                }

                res.json(rows[0]);
            }
        );
    });
});


app.get('/api/stock/:itemid', (req, res) => {

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        db.query(

            `SELECT SUM(qtyin - qtyout) AS totqty FROM STOCKLEDGER WHERE ITEMID = ?`,

            [req.params.itemid],

            (err, rows) => {

                db.detach();

                if (err) {
                    return res.status(500).json({
                        error: err.message
                    });
                }

                res.json({
                    stock: rows[0].totqty || 0
                });
            }
        );
    });
});

app.get('/api/groups', (req, res) => {

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        db.query(

            `SELECT DISTINCT TMPGRP FROM QTNDET ORDER BY TMPGRP `,

            [],

            (err, rows) => {

                db.detach();

                if (err) {
                    return res.status(500).json({
                        error: err.message
                    });
                }

                res.json(rows);
            }
        );
    });
});

// ── Generate QR code image 
app.get('/api/qr/:id', async (req, res) => {
    try {

        const qrText = String(req.params.id);
        // const qrText = item.ucode;

        console.log("Generating QR for:", qrText);

        const buffer = await QRCode.toBuffer(qrText, {
            errorCorrectionLevel: 'H',
            type: 'png',
            width: 600,
            margin: 6,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        res.setHeader('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: err.message
        });
    }
});


app.get('/api/item-by-ucode/:ucode', (req, res) => {

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        db.query(

            `SELECT PRODUCT,CATEGORY,ITEM,COLOUR,ITMSIZE,QLTY,PACK,ITEMID FROM V_ALLITEM WHERE UCODE = ?`,

            [req.params.ucode],

            (err, rows) => {

                //db.detach();

                if (err) {
                    return res.status(500).json({
                        error: err.message
                    });
                }

                //res.json(rows[0]);
                console.log("UCODE:", req.params.ucode);
                console.log("Rows:", rows);

                if (!rows || rows.length === 0) {
                    return res.status(404).json({
                        error: 'Item not found'
                    });
                }

                const itemData = rows[0];

                db.query(
                    `SELECT UNIT FROM ITEM WHERE ITEMID = ?`,
                    [itemData.itemid],
                    (unitErr, unitRows) => {

                        if (unitErr) {
                            console.log("UNIT ERROR:", unitErr);
                            return res.json(itemData);
                        }

                        itemData.unit =
                            unitRows.length > 0
                                ? unitRows[0].unit
                                : "";

                        res.json(itemData);
                    }
                );

            }
        );
    });
});
app.post("/api/save-cart", (req, res) => {

    const {
        smcode,
        customerName,
        phone,
        items,
        editing
    } = req.body;


    getDb((err, db) => {

        if (err) {

            return res.status(500).json({
                error: err.message
            });

        }


        // --------------------------------------------------------
        // STEP 1: If editing an existing cart,
        // delete its old rows first.
        // --------------------------------------------------------

        const saveItems = () => {

            let count = 0;


            // Safety check
            if (!items || items.length === 0) {

                db.detach();

                return res.json({
                    success: true
                });

            }


            // ----------------------------------------------------
            // STEP 2: Insert the CURRENT cart items
            // ----------------------------------------------------

            items.forEach(item => {

                db.query(

                    `INSERT INTO SELECTION (SMCODE, CNAME,MOBILENO,UCODE, QTY,RATE,TMPGRP ) VALUES (?, ?, ?, ?, ?, ?, ?)`,

                    [
                        smcode,
                        customerName,
                        phone,
                        item.id,
                        item.qty,
                        item.price,
                        item.group || ""
                    ],

                    (err) => {

                        if (err) {

                            console.log(
                                "SAVE CART ERROR:",
                                err
                            );

                            db.detach();

                            return res.status(500).json({
                                error: err.message
                            });

                        }


                        count++;


                        // All items saved
                        if (count === items.length) {

                            db.detach();

                            res.json({
                                success: true
                            });

                        }

                    }

                );

            });

        };


        // --------------------------------------------------------
        // EDITING EXISTING CART
        // --------------------------------------------------------

        if (editing) {

            db.query(

                `DELETE FROM SELECTION
                 WHERE SMCODE = ?
                 AND MOBILENO = ?`,

                [
                    smcode,
                    phone
                ],

                (err) => {

                    if (err) {

                        db.detach();

                        return res.status(500).json({
                            error: err.message
                        });

                    }


                    // Old cart deleted.
                    // Now save the updated cart.
                    saveItems();

                }

            );

        } else {

            // ----------------------------------------------------
            // NEW CART
            // ----------------------------------------------------

            saveItems();

        }

    });

});

// GET EXISTING CARTS
app.get('/api/existing-carts/:smcode', (req, res) => {

    getDb((err, db) => {

        if (err)
            return res.status(500).json({ error: err.message });

        db.query(

            `SELECT CNAME,MOBILENO,SMCODE FROM SELECTION WHERE SMCODE = ? GROUP BY CNAME,MOBILENO,SMCODE`,
            [req.params.smcode],
            (err, rows) => {

                db.detach();

                if (err)
                    return res.status(500).json({ error: err.message });

                console.log("ROWS:", rows);

                res.json(rows);

            }

        );

    });

});
// GET ITEMS OF A CART
app.get('/api/cart/:mobile', (req, res) => {

    getDb((err, db) => {

        if (err)
            return res.status(500).json({ error: err.message });

        db.query(

            `SELECT S.UCODE,S.QTY,S.RATE,S.TMPGRP,V.PRODUCT,V.CATEGORY,V.ITEM,V.COLOUR,V.ITMSIZE,V.QLTY,V.PACK,I.UNIT
             FROM SELECTION S JOIN V_ALLITEM V ON V.UCODE = S.UCODE LEFT JOIN ITEM I ON I.ITEMID = V.ITEMID WHERE S.MOBILENO = ?`,

            [req.params.mobile],

            (err, rows) => {

                db.detach();

                if (err)
                    return res.status(500).json({ error: err.message });

                res.json(rows);

            }

        );

    });

});

app.post('/api/delete-cart', (req, res) => {

    const { smcode, mobile } = req.body;

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }

        db.query(
            `DELETE FROM SELECTION
             WHERE SMCODE = ?
             AND MOBILENO = ?`,

            [smcode, mobile],

            (err) => {

                db.detach();

                if (err) {
                    return res.status(500).json({
                        success: false,
                        error: err.message
                    });
                }

                res.json({
                    success: true
                });

            }
        );

    });

});

// ── GET UNIQUE GROUPS ─────────────────────────────
app.get('/api/groups', (req, res) => {

    getDb((err, db) => {

        if (err)
            return res.status(500).json({
                error: err.message
            });

        db.query(
            `SELECT DISTINCT TMPGRP
             FROM QTNDET
             WHERE TMPGRP IS NOT NULL
               AND TRIM(TMPGRP) <> ''
             ORDER BY TMPGRP`,

            [],

            (err, rows) => {

                db.detach();

                if (err)
                    return res.status(500).json({
                        error: err.message
                    });

                const groups = rows.map(
                    row => row.TMPGRP
                );

                res.json(groups);
            }
        );

    });

});


// ============================================================
// DELETE ONE ITEM FROM CART
// ============================================================

// ============================================================
// DELETE ONE ITEM FROM CART
// Deletes only the item matching:
// MOBILE + UCODE + GROUP
// ============================================================

// ============================================================
// DELETE ONE ITEM FROM CART
// Deletes only the selected item + selected group
// ============================================================

app.delete('/api/cart/:mobile/:ucode/:group', (req, res) => {

    const mobile = String(req.params.mobile || "");
    const ucode = String(req.params.ucode || "");

    let group = decodeURIComponent(req.params.group || "");

    // Special value means the item has no group
    if (group === "__NO_GROUP__") {
        group = "";
    }

    // --------------------------------------------------------
    // Escape text safely for SQL
    // --------------------------------------------------------

    const sqlString = (value) => {
        return "'" + String(value).replace(/'/g, "''") + "'";
    };

    // --------------------------------------------------------
    // Build the DELETE query
    // --------------------------------------------------------

    let groupCondition;

    if (group.trim() === "") {

        // Empty or NULL group
        groupCondition = `
            (TMPGRP IS NULL OR TRIM(TMPGRP) = '')
        `;

    } else {

        // Specific group
        groupCondition = `
            TRIM(TMPGRP) = ${sqlString(group.trim())}
        `;
    }

    const sql = `
        DELETE FROM SELECTION
        WHERE MOBILENO = ${sqlString(mobile)}
        AND UCODE = ${sqlString(ucode)}
        AND ${groupCondition}
    `;

    console.log("DELETE SQL:");
    console.log(sql);

    // --------------------------------------------------------
    // Execute DELETE
    // --------------------------------------------------------

    getDb((err, db) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        db.query(sql, (err) => {

            db.detach();

            if (err) {
                console.error("DELETE ERROR:", err);

                return res.status(500).json({
                    error: err.message
                });
            }

            res.json({
                success: true
            });

        });

    });

});
const https = require('https');
const http = require('http');
const os = require('os');

const PORT = process.env.PORT || 3000;

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    let fallback = 'localhost';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (/wi-fi|wireless|wlan/i.test(name)) {
                    return iface.address;
                }
                if (!iface.address.startsWith('192.168.56.') && !iface.address.startsWith('172.19.')) {
                    fallback = iface.address;
                }
            }
        }
    }
    return fallback;
}

const keyPath = path.join(__dirname, 'key.pem');
const certPath = path.join(__dirname, 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    https.createServer({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    }, app).listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on https://localhost:${PORT}`);
        console.log(`Mobile: https://${getLocalIp()}:${PORT}`);
    });
} else {
    http.createServer(app).listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Mobile: http://${getLocalIp()}:${PORT}`);
    });
}