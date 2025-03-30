const mysql = require("mysql2");
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const XLSX = require("xlsx");
const app = express();
const encoder = bodyParser.urlencoded({ extended: true });

app.use(express.static("public"));
app.set('view engine', 'ejs');

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Real5656@",
    database: "mydatabase"
});

connection.connect(function (error) {
    if (error) throw error;
    else console.log("Connected to the database successfully!");
});

const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

function isAuthenticated(req, res, next) {
    if (req.session.user) next();
    else res.redirect("/login");
}

function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === "admin") next();
    else res.send("Access denied. Admins only.");
}

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/login.html");
});

app.get("/login", function (req, res) {
    res.sendFile(__dirname + "/login.html");
});

app.get("/signup", function (req, res) {
    res.sendFile(__dirname + "/signup.html");
});

app.post("/signup", encoder, async function (req, res) {
    const { username, password, email, phone } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = "INSERT INTO users (username, password, email, phone, role) VALUES (?, ?, ?, ?, 'customer')";
        connection.query(sql, [username, hashedPassword, email || null, phone || null], function (err, result) {
            if (err) {
                console.log(err);
                res.send("Error creating account");
            } else {
                console.log("User created");
                res.redirect("/login");
            }
        });
    } catch (error) {
        console.log(error);
        res.send("Error during signup");
    }
});

app.post("/login", encoder, async function (req, res) {
    const { login_field, password } = req.body;
    const sql = "SELECT * FROM users WHERE email = ? OR phone = ?";
    connection.query(sql, [login_field, login_field], async function (err, result) {
        if (err) throw err;
        if (result.length > 0) {
            const user = result[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.user = { id: user.id, username: user.username, role: user.role };
                if (user.role === "admin") {
                    res.redirect("/admin-dashboard");
                } else {
                    res.redirect("/customer-dashboard");
                }
            } else {
                res.send("Invalid credentials");
            }
        } else {
            res.send("Invalid credentials");
        }
    });
});

app.get("/admin-dashboard", isAdmin, function (req, res) {
    res.render("admin-dashboard", { username: req.session.user.username });
});

app.get("/customer-dashboard", isAuthenticated, function (req, res) {
    res.render("customer-dashboard", { username: req.session.user.username });
});

app.get("/add-product", isAdmin, function (req, res) {
    res.render("add-product");
});

app.post("/add-product", isAdmin, upload.single('image'), function (req, res) {
    const {
        name, unit, barcode, quantity, buy_price, sell_price,
        tax, tax_type, purchase_tax, sales_tax, category, availability
    } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = `
        INSERT INTO products (name, unit, barcode, quantity, buy_price, sell_price, tax, tax_type, purchase_tax, sales_tax, image, category, availability)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    connection.query(sql, [
        name, unit, barcode || null, quantity, buy_price, sell_price,
        tax, tax_type, purchase_tax, sales_tax, image, category || null, availability
    ], function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error adding product");
        } else {
            console.log("Product added");
            res.redirect("/admin-dashboard");
        }
    });
});

app.get("/import-products", isAdmin, function (req, res) {
    res.send(`
        <h1>Import Products from Excel</h1>
        <form action="/import-products" method="post" enctype="multipart/form-data">
            <input type="file" name="excelFile" accept=".xlsx, .xls" required>
            <button type="submit">Upload and Import</button>
        </form>
        <a href="/admin-dashboard">Back to Dashboard</a>
    `);
});

app.post("/import-products", isAdmin, upload.single('excelFile'), function (req, res) {
    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const sql = `
        INSERT INTO products (name, unit, barcode, quantity, buy_price, sell_price, tax, tax_type, purchase_tax, sales_tax, category, availability)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    data.forEach(row => {
        connection.query(sql, [
            row.name || '',
            row.unit || 'piece',
            row.barcode || null,
            row.quantity || 0,
            row.buy_price || 0,
            row.sell_price || 0,
            row.tax || 0,
            row.tax_type || 'percentage',
            row.purchase_tax || 0,
            row.sales_tax || 0,
            row.category || null,
            row.availability || 'available'
        ], function (err) {
            if (err) console.log("Error importing row:", err);
        });
    });

    res.redirect("/admin-dashboard");
});

app.get("/export-products", isAdmin, function (req, res) {
    connection.query("SELECT * FROM products", function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error exporting products");
            return;
        }

        const data = result.map(row => ({
            name: row.name,
            unit: row.unit,
            barcode: row.barcode,
            quantity: row.quantity,
            buy_price: row.buy_price,
            sell_price: row.sell_price,
            tax: row.tax,
            tax_type: row.tax_type,
            purchase_tax: row.purchase_tax,
            sales_tax: row.sales_tax,
            category: row.category,
            availability: row.availability
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
        const filePath = `./public/uploads/products-export-${Date.now()}.xlsx`;
        XLSX.writeFile(workbook, filePath);

        res.download(filePath, "products.xlsx", (err) => {
            if (err) console.log("Error downloading file:", err);
        });
    });
});

app.get("/products", isAuthenticated, function (req, res) {
    const search = req.query.search || '';
    const sql = `
        SELECT * FROM products 
        WHERE availability = 'available' 
        AND (name LIKE ? OR barcode LIKE ?)
    `;
    connection.query(sql, [`%${search}%`, `%${search}%`], function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error fetching products");
            return;
        }
        res.render("products", { products: result, search: search });
    });
});

app.post("/add-to-cart", isAuthenticated, encoder, function (req, res) {
    const { product_id, quantity, unit } = req.body;
    const user_id = req.session.user.id;

    const sql = `
        INSERT INTO cart (user_id, product_id, quantity, unit)
        VALUES (?, ?, ?, ?)
    `;
    connection.query(sql, [user_id, product_id, quantity, unit], function (err) {
        if (err) {
            console.log(err);
            res.send("Error adding to cart");
            return;
        }
        res.redirect("/products");
    });
});

app.get("/cart", isAuthenticated, function (req, res) {
    const user_id = req.session.user.id;
    const sql = `
        SELECT p.name, p.sell_price, c.quantity, c.unit 
        FROM cart c 
        JOIN products p ON c.product_id = p.id 
        WHERE c.user_id = ?
    `;
    connection.query(sql, [user_id], function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error fetching cart");
            return;
        }
        const total = result.reduce((sum, item) => sum + (item.quantity * (parseFloat(item.sell_price) || 0)), 0);
        res.render("cart", { items: result, total });
    });
});
app.get("/table", isAuthenticated, function (req, res) {
    connection.query("SELECT * FROM enteruser", function (err, result) {
        if (err) throw err;
        res.render("table", { users: result });
    });
});

app.post("/search", encoder, isAuthenticated, function (req, res) {
    const search = req.body.search;
    connection.query("SELECT * FROM enteruser WHERE fname LIKE ? OR lname LIKE ? OR email LIKE ? OR address LIKE ? OR contact LIKE ?",
        [`${search}%`, `${search}%`, `${search}%`, `${search}%`, `${search}%`],
        function (err, result) {
            if (err) throw err;
            res.render("search-result", { users: result });
        });
});

app.get("/create-invoice", isAuthenticated, function (req, res) {
    res.render("create-invoice");
});

app.get("/search-product", isAuthenticated, function (req, res) {
    const search = req.query.search || '';
    const sql = `
        SELECT id, name, barcode, sell_price, quantity 
        FROM products 
        WHERE availability = 'available' 
        AND (name LIKE ? OR barcode LIKE ?)
    `;
    connection.query(sql, [`%${search}%`, `%${search}%`], function (err, result) {
        if (err) {
            console.log(err);
            res.status(500).json({ error: "Error searching products" });
            return;
        }
        res.json(result);
    });
});

app.post("/create-invoice", isAuthenticated, encoder, function (req, res) {
    const { client_name, client_phone, client_tax_number, client_address, items } = req.body;
    const user_id = req.session.user.id;

    const invoiceSql = `
        INSERT INTO invoices (user_id, client_name, client_phone, client_tax_number, client_address)
        VALUES (?, ?, ?, ?, ?)
    `;
    connection.query(invoiceSql, [user_id, client_name, client_phone || null, client_tax_number || null, client_address || null], function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error creating invoice");
            return;
        }

        const invoiceId = result.insertId;
        const productIds = Object.values(items).map(item => item.product_id);

        connection.query("SELECT id, sell_price FROM products WHERE id IN (?)", [productIds], function (err, products) {
            if (err) {
                console.log(err);
                res.send("Error fetching product prices");
                return;
            }

            const priceMap = new Map(products.map(p => [p.id, p.sell_price]));
            const itemsSql = `
                INSERT INTO invoice_items (invoice_id, product_id, quantity, unit, price)
                VALUES ?
            `;
            const itemValues = Object.keys(items).map(index => {
                const item = items[index];
                const productId = parseInt(item.product_id);
                const price = priceMap.get(productId) || 0;
                return [invoiceId, productId, item.quantity, item.unit, price];
            });

            if (itemValues.length > 0) {
                connection.query(itemsSql, [itemValues], function (err) {
                    if (err) {
                        console.log(err);
                        res.send("Error adding items to invoice");
                        return;
                    }
                    res.redirect("/customer-dashboard");
                });
            } else {
                res.redirect("/customer-dashboard");
            }
        });
    });
});

app.get("/request-product", isAuthenticated, function (req, res) {
    res.render("request-product");
});

app.post("/request-product", isAuthenticated, upload.single('image'), function (req, res) {
    const { name, quantity, barcode, type } = req.body;
    const user_id = req.session.user.id;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = `
        INSERT INTO requests (user_id, name, quantity, barcode, type, image, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `;
    connection.query(sql, [user_id, name, quantity, barcode || null, type || null, image], function (err) {
        if (err) {
            console.log(err);
            res.send("Error submitting request");
            return;
        }
        res.redirect("/customer-dashboard");
    });
});

app.get("/view-requests", isAdmin, function (req, res) {
    const sql = `
        SELECT r.*, u.username 
        FROM requests r 
        JOIN users u ON r.user_id = u.id
    `;
    connection.query(sql, function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error fetching requests");
            return;
        }
        res.render("view-requests", { requests: result });
    });
});

app.post("/update-request-status", isAdmin, encoder, function (req, res) {
    const { request_id, status } = req.body;
    const sql = "UPDATE requests SET status = ? WHERE id = ?";
    connection.query(sql, [status, request_id], function (err) {
        if (err) {
            console.log(err);
            res.send("Error updating request status");
            return;
        }
        res.redirect("/approve-requests"); // إعادة توجيه إلى صفحة الاعتماد
    });
});

app.get("/inventory", isAdmin, function (req, res) {
    const search = req.query.search || '';
    const sql = `
        SELECT id, name, quantity, barcode, created_at 
        FROM products 
        WHERE name LIKE ? OR barcode LIKE ?
    `;
    connection.query(sql, [`%${search}%`, `%${search}%`], function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error fetching inventory");
            return;
        }
        res.render("inventory", { products: result, search: search });
    });
});

app.post("/update-quantity", isAdmin, encoder, function (req, res) {
    const { product_id, quantity } = req.body;
    const sql = "UPDATE products SET quantity = ? WHERE id = ?";
    connection.query(sql, [quantity, product_id], function (err) {
        if (err) {
            console.log(err);
            res.send("Error updating quantity");
            return;
        }
        res.redirect("/inventory");
    });
});

app.get("/export-inventory", isAdmin, function (req, res) {
    const sql = "SELECT name, quantity, barcode, created_at FROM products";
    connection.query(sql, function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error exporting inventory");
            return;
        }

        const data = result.map(row => ({
            Name: row.name,
            Quantity: row.quantity,
            Barcode: row.barcode || 'N/A',
            "Added Date": row.created_at.toLocaleDateString()
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
        const filePath = `./public/uploads/inventory-export-${Date.now()}.xlsx`;
        XLSX.writeFile(workbook, filePath);

        res.download(filePath, "inventory.xlsx", (err) => {
            if (err) console.log("Error downloading file:", err);
        });
    });
});

// Delete a specific product
app.post("/delete-product", isAdmin, encoder, function (req, res) {
    const { product_id } = req.body;
    const sql = "DELETE FROM products WHERE id = ?";
    connection.query(sql, [product_id], function (err) {
        if (err) {
            console.log(err);
            res.send("Error deleting product");
            return;
        }
        res.redirect("/inventory");
    });
});

// Delete all products
app.post("/delete-all-products", isAdmin, encoder, function (req, res) {
    const sql = "DELETE FROM products";
    connection.query(sql, function (err) {
        if (err) {
            console.log(err);
            res.send("Error deleting all products");
            return;
        }
        res.redirect("/inventory");
    });
});

// Update a product
app.post("/update-product", isAdmin, encoder, function (req, res) {
    const { product_id, name, quantity, barcode } = req.body;
    const sql = `
        UPDATE products 
        SET name = ?, quantity = ?, barcode = ?
        WHERE id = ?
    `;
    connection.query(sql, [name, quantity, barcode || null, product_id], function (err) {
        if (err) {
            console.log(err);
            res.send("Error updating product");
            return;
        }
        res.redirect("/inventory");
    });
});

app.get("/invoices", isAdmin, function (req, res) {
    const search = req.query.search || '';
    const sql = `
        SELECT i.*, 
               COALESCE(SUM(ii.quantity * p.sell_price), 0) AS total
        FROM invoices i
        LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
        LEFT JOIN products p ON ii.product_id = p.id
        WHERE i.client_name LIKE ? OR i.id LIKE ?
        GROUP BY i.id
    `;
    connection.query(sql, [`%${search}%`, `%${search}%`], function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error fetching invoices");
            return;
        }
        res.render("invoices", { invoices: result, search: search });
    });
});

app.get("/invoice-details/:id", isAdmin, function (req, res) {
    const invoiceId = req.params.id;

    // Fetch invoice details
    const invoiceSql = "SELECT * FROM invoices WHERE id = ?";
    const itemsSql = `
        SELECT p.name, ii.quantity, ii.unit, p.sell_price
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
    `;
    const totalSql = `
        SELECT COALESCE(SUM(ii.quantity * p.sell_price), 0) AS total
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
    `;

    connection.query(invoiceSql, [invoiceId], function (err, invoiceResult) {
        if (err || invoiceResult.length === 0) {
            console.log(err);
            res.send("Error fetching invoice or invoice not found");
            return;
        }

        connection.query(itemsSql, [invoiceId], function (err, itemsResult) {
            if (err) {
                console.log(err);
                res.send("Error fetching invoice items");
                return;
            }

            connection.query(totalSql, [invoiceId], function (err, totalResult) {
                if (err) {
                    console.log(err);
                    res.send("Error fetching total");
                    return;
                }

                const invoice = invoiceResult[0];
                invoice.total = totalResult[0].total; // Add total to invoice object
                res.render("invoice-details", { invoice: invoice, items: itemsResult });
            });
        });
    });
});

app.get("/export-invoices", isAdmin, function (req, res) {
    const sql = `
        SELECT i.id, i.client_name, i.client_phone, i.client_tax_number, i.client_address, i.created_at,
               ii.quantity, ii.unit, ii.price, p.name AS product_name
        FROM invoices i
        LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
        LEFT JOIN products p ON ii.product_id = p.id
    `;
    connection.query(sql, function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error exporting invoices");
            return;
        }

        const data = result.map(row => ({
            "Invoice ID": row.id,
            "Client Name": row.client_name,
            "Client Phone": row.client_phone || 'N/A',
            "Tax Number": row.client_tax_number || 'N/A',
            "Address": row.client_address || 'N/A',
            "Created At": row.created_at.toLocaleDateString(),
            "Product Name": row.product_name || 'N/A',
            "Quantity": row.quantity || 0,
            "Unit": row.unit || 'N/A',
            "Price": row.price || 0,
            "Subtotal": (row.quantity * row.price) || 0
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");
        const filePath = `./public/uploads/invoices-export-${Date.now()}.xlsx`;
        XLSX.writeFile(workbook, filePath);

        res.download(filePath, "invoices.xlsx", (err) => {
            if (err) console.log("Error downloading file:", err);
        });
    });
});

// Reports Route
app.get("/reports", isAdmin, function (req, res) {
    const totalSalesSql = `
        SELECT SUM(ii.quantity * ii.price) AS total_sales
        FROM invoice_items ii
    `;
    const mostRequestedSql = `
        SELECT r.name, COUNT(*) AS request_count
        FROM requests r
        GROUP BY r.name
        ORDER BY request_count DESC
        LIMIT 5
    `;

    connection.query(totalSalesSql, function (err, salesResult) {
        if (err) {
            console.log(err);
            res.send("Error fetching total sales");
            return;
        }
        const totalSales = salesResult[0].total_sales || 0;

        connection.query(mostRequestedSql, function (err, requestResult) {
            if (err) {
                console.log(err);
                res.send("Error fetching most requested products");
                return;
            }
            res.render("reports", { totalSales, mostRequested: requestResult });
        });
    });
});

// Export Reports Route
app.get("/export-reports", isAdmin, function (req, res) {
    const totalSalesSql = `
        SELECT SUM(ii.quantity * ii.price) AS total_sales
        FROM invoice_items ii
    `;
    const mostRequestedSql = `
        SELECT r.name, COUNT(*) AS request_count
        FROM requests r
        GROUP BY r.name
        ORDER BY request_count DESC
        LIMIT 5
    `;

    connection.query(totalSalesSql, function (err, salesResult) {
        if (err) {
            console.log(err);
            res.send("Error exporting reports");
            return;
        }
        const totalSales = salesResult[0].total_sales || 0;

        connection.query(mostRequestedSql, function (err, requestResult) {
            if (err) {
                console.log(err);
                res.send("Error exporting reports");
                return;
            }

            const data = [
                { "Report": "Total Sales", "Value": totalSales.toFixed(2) + " SAR" },
                ...requestResult.map(row => ({
                    "Report": "Most Requested Product",
                    "Product Name": row.name,
                    "Request Count": row.request_count
                }))
            ];

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
            const filePath = `./public/uploads/reports-export-${Date.now()}.xlsx`;
            XLSX.writeFile(workbook, filePath);

            res.download(filePath, "reports.xlsx", (err) => {
                if (err) console.log("Error downloading file:", err);
            });
        });
    });
});

// Approve Requests Route
app.get("/approve-requests", isAdmin, function (req, res) {
    const sql = `
        SELECT r.*, u.username 
        FROM requests r 
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'pending'
    `;
    connection.query(sql, function (err, result) {
        if (err) {
            console.log(err);
            res.send("Error fetching pending requests");
            return;
        }
        res.render("approve-requests", { requests: result });
    });
});

app.get("/logout", function (req, res) {
    req.session.destroy();
    res.redirect("/login");
});

app.listen(4000, () => console.log("Server running on port 4000"));