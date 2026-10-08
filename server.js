require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
var sha1=require('sha1');


const app = express();
const port = process.env.APP_PORT;
app.use(express.json()); // Ezzel tudja a kódod olvasni a JSON formátumú req.body-t
app.use(express.urlencoded({ extended: true }));

app.use(cors());

const pWRegEXP = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;


var pool = mysql.createPool({
    connectionLimit:     process.env.DB_CONN_LIMIT,
    multipleStatements:  process.env.DB_MULTI_QUERY,
    host:                process.env.DB_HOST,
    user:                process.env.DB_USER,
    password:            process.env.DB_PASS,
    port:                process.env.DB_PORT,
    database:            process.env.DB_NAME,
    timezone:            process.env.DB_TIMEZONE,
});



app.get('/', (_req, res) => 
    {
        res.send('Üdv időjárás API-nkban!');
    });

app.listen(port, () => {
    console.log(`Server is running on port "http://localhost:${port}"`);
});


// registration endpoint
app.post('/register', (req, res) => {
    const { name, email, password, confirm } = req.body;
    if(!name || !email || !password || !confirm) 
        {
            return res.status(400).json({ message: 'Minden mező kitöltése kötelező!' });
        }
    if(password !== confirm)
        {
            return res.status(400).json({ message: 'A jelszavak nem egyeznek!' });
        }
    // if(!password.match(pWRegEXP))
    //     {
    //         return res.status(400).json({ message: 'A jelszó nem megfelelő!' });
    //     }
    // check if email already exists
    pool.query('SELECT * FROM users WHERE email = ?', [email], (error, results) => 
        {
            if(error)
                {
                    return res.status(500).json({ message: 'Hiba történt az adatbázis lekérdezés során!' });
                }
            if(results.length > 0)
                {
                    return res.status(400).json({ message: 'Az email cím már regisztrálva van!' });
                }
            
            pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, sha1(password)], (error, results) => 
                {
                    if(error)
                        {
                            return res.status(500).json({ message: 'Hiba történt az adatbázis beszúrás során!' });
                        }
                    return res.status(201).json({ message: 'Sikeres regisztráció!' });
                });
        });


});
// login endpoint
app.post('/login', (req, res) => 
    {
        const { email, password } = req.body;
        if(!email || !password)
            {
                return res.status(400).json({ message: 'Minden mező kitöltése kötelező!' });
            }

        // JAVÍTVA: Lekérjük a felhasználót az email és a hashelt jelszó alapján (a táblában 'passwd' a mező!)
        pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, sha1(password)], (error, dbResults) => {
            if(error) {
                return res.status(500).json({ message: 'Hiba történt az adatbázis lekérdezés során!' });
            }

            // Ha nincs ilyen felhasználó
            if(dbResults.length == 0)
                {
                    return res.status(400).json({ message: 'Hibás email vagy jelszó!' });
                }

            
            if(dbResults[0].status == 0)
                {
                    return res.status(400).json({ message: 'A felhasználó nem aktív! (banned by admin)' });
                }

            const loggedUser = 
            {
                ID : dbResults[0].ID,
                name : dbResults[0].name,
                email : dbResults[0].email,
                status : dbResults[0].status
            }

            
            pool.query('UPDATE users SET last = CURRENT_TIMESTAMP, loginCount = loginCount + 1 WHERE ID = ? ', [loggedUser.ID], (updateError) => 
                {
                    if(updateError)
                        {
                            return res.status(500).json({ message: 'Hiba történt az adatbázis frissítés során!' });
                        }
                    return res.status(200).json({ message: 'Sikeres bejelentkezés!', user: loggedUser });
                });
        });
    });


    
