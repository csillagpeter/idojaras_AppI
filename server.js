require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
var sha1=require('sha1');


const app = express();
const port = process.env.APP_PORT;
app.use(express.json()); 
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
app.post('/users/register', (req, res) => {
    const { name, email, passwd, confirm } = req.body;
    if(!name || !email || !passwd || !confirm) 
        {
            return res.status(400).json({ message: 'Minden mező kitöltése kötelező!' });
        }
    if(passwd !== confirm)
        {
            return res.status(400).json({ message: 'A jelszavak nem egyeznek!' });
        }
    
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
            
            pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, sha1(passwd)], (error, results) => 
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
app.post('/users/login', (req, res) => 
    {
        const { email, password } = req.body;
        if(!email || !password)
            {
                return res.status(400).json({ message: 'Minden mező kitöltése kötelező!' });
            }

        
        pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, sha1(password)], (error, dbResults) => {
            if(error) {
                return res.status(500).json({ message: 'Hiba történt az adatbázis lekérdezés során!' });
            }

            
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
                status : dbResults[0].status,
                role : dbResults[0].role
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
//-----------------------------------------------------------------------------------------------------------
// PAASSWORD CHANGE ENDPOINT
app.post('/users/:uid/passmod', (req, res) => 
    {
        const{ newpass, oldpass, confirm } = req.body;
        const uid = req.params.uid;

        if(!oldpass || !newpass || !confirm)
            {
                return res.status(400).json({ message: 'Minden mező kitöltése kötelező!' });
            }
        if(newpass !== confirm)
            {
                return res.status(400).json({ message: 'Az új jelszavak nem egyeznek!' });
            }
        const oldpassHash = sha1(oldpass);
        pool.query('SELECT * FROM users WHERE ID = ? ', [(sha1(oldpass)),uid], (error, results) => 
            {
                if(error)
                    {
                        return res.status(500).json({ message: 'Hiba történt az adatbázis lekérdezés során!' });
                    }
                    return res.status(200).json({ message: 'Sikeres jelszó módosítás!' });
            })
    })

// get profile endpoint
app.get('/users/:uid', (req, res) => 
    {
        const uid = req.params.uid;
        pool.query('SELECT * FROM users WHERE ID = ?', [uid], (error, results) => {
            if(error) {
                return res.status(500).json({ message: 'Hiba történt az adatbázis lekérdezés során!' });
            }
            if(results.length == 0) {
                return res.status(404).json({ message: 'A felhasználó nem található!' });
            }
           
            
            let user={
                "name": results[0].name,
                "email": results[0].email,
                "role": results[0].role,
                "loginCount": results[0].loginCount

            }


            return res.status(200).json({ result: user });
        });
    })

// update profile endpoint
app.patch('/users/:uid', (req, res) => {
    const uid = req.params.uid;
    const { username, email, luid } = req.body;

    if (!username || !email || !luid) {
        return res.status(400).json({ message: 'Minden mező kitöltése kötelező!' });
    }
    if (luid != uid) {
        return res.status(400).json({ message: 'Hibás felhasználói azonosító!' });
    }

    
    pool.query('SELECT * FROM users WHERE ID = ?', [uid], (error, results) => {
        if (error) {
            return res.status(500).json({ message: 'Hiba történt az adatbázis lekérdezés során!' });
        }
        if (results.length == 0) {
            return res.status(404).json({ message: 'A felhasználó nem található!' });
        }
        if (username === results[0].name && email === results[0].email) {
            return res.status(400).json({ message: 'Nincs módosítás!' });
        }

        
        pool.query('SELECT * FROM users WHERE email = ? AND ID <> ?', [email, uid], (error, emailResults) => {
            if (error) {
                return res.status(500).json({ message: 'Hiba történt az adatbázis lekérdezés során!' });
            }
            if (emailResults.length > 0) {
                return res.status(400).json({ message: 'Az email cím már használatban van!' });
            }

           
            pool.query('UPDATE users SET name = ?, email = ? WHERE ID = ?', [username, email, uid], (error, updateResults) => {
                if (error) {
                    return res.status(500).json({ message: 'Hiba történt az adatbázis frissítés során!' });
                }
                return res.status(200).json({ message: 'Sikeres profil frissítés!' });
            });
        });
    });
});


// delete profile endpoint
app.delete('/users/:uid', (req, res) => 
    {   
        const uid = req.params.uid;
        const loggedUserId = req.body.luid;
        if(!uid || !loggedUserId)
        {
            return res.status(400).json({ message: 'Minden mező kitöltése kötelező!' });
        }
        if(uid != loggedUserId)
        {
            return res.status(403).json({ message: 'Nem rendelkezik a megfelelő jogosultságokkal!' });
        }
        pool.query('DELETE FROM users WHERE ID = ?', [uid], (error, results) =>
            {
                if(error)
                    {
                        return res.status(500).json({ message: 'Hiba történt az adatbázis törlés során!' });
                    }
                if(results.affectedRows == 1)
                    {
                        return res.status(200).json({ message: 'Sikeres profil törlés!' });
                    }
                return res.status(404).json({ message: 'A felhasználó nem található!' });
            })

    })
//foreacast endpoint
//  ELŐREJELZÉSEK LEKÉRDEZÉSE 
app.get('/api/forecast', (req, res) => {
    const location = req.query.location || 'Budapest'; // Alapértelmezett város

    
    const query = `
        SELECT ID, date, location, temp_min, temp_max, weather_type 
        FROM weather_forecasts 
        WHERE location = ? AND date >= CURDATE()
        ORDER BY date ASC 
        LIMIT 5
    `;

    pool.query(query, [location], (error, results) => {
        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Hiba történt az időjárás adatok lekérdezése során!' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: `Nem található előrejelzés a következő helyszínre: ${location}` });
        }
        return res.json(results);
    });
});

//NAP RÉSZLETES ADATAINAK LEKÉRDEZÉSE 
app.get('/api/forecast/details/:id', (req, res) => {
    const forecastId = req.params.id;

    const query = 'SELECT * FROM weather_forecasts WHERE ID = ?';

    pool.query(query, [forecastId], (error, results) => {
        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Hiba történt a részletes adatok lekérdezése során!' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'A kért részletes adat nem található!' });
        }
        return res.json(results[0]); 
    });
});
// get all users
// admin/users endpoint
app.post('/admin/users', (req, res) => {
    const { luid } = req.body;

    if (!luid) {
        return res.status(400).json({ message: 'Hiányzó adminisztrátori azonosító!' });
    }

   
    pool.query('SELECT role FROM users WHERE ID = ?', [luid], (error, results) => {
        if (error) {
            return res.status(500).json({ message: 'Hiba történt a jogosultság ellenőrzése során!' });
        }
        if (results.length === 0 || results[0].role !== 'admin') {
            return res.status(403).json({ message: 'Hozzáférés megtagadva! Nem vagy adminisztrátor.' });
        }

        
        const query = 'SELECT ID, name, email, role, status, reg, last, loginCount FROM users ORDER BY ID ASC';
        
        pool.query(query, (fetchError, users) => {
            if (fetchError) {
                return res.status(500).json({ message: 'Hiba történt a felhasználók lekérésekor!' });
            }
            return res.status(200).json(users);
        });
    });
});

app.patch('/admin/status', (req, res) => {
    const { uid, luid } = req.body;

    if (!uid || !luid) {
        return res.status(400).json({ error: 'Missing required fields!' });
    }

    // admin-e?
    pool.query('SELECT * FROM users WHERE ID=?', [luid], (error, results1) => {
        if (error) {
            return res.status(500).json({ error: 'Database query error' });
        }

        if (results1.length == 0) {
            return res.status(400).json({ error: 'User with this ID doesn\'t exist!' });
        }

        if (results1[0].role != 'admin') {
            return res.status(400).json({ error: 'You don\'t have permission to change this user status!' });
        }

        pool.query('SELECT * FROM users WHERE ID=?', [uid], (error, results) => {
            if (error) {
                return res.status(500).json({ error: 'Database query error' });
            }

            if (results.length == 0) {
                return res.status(400).json({ error: 'User with this ID doesn\'t exist!' });
            }

            pool.query('UPDATE users SET status = 0 WHERE ID=?', [uid], (error, results2) => {
                if (error) {
                    return res.status(500).json({ error: 'Database query error' });
                }

                return res.status(200).json({ message: 'User status changed!' });
            });
        });

    });


});
app.post('/admin/statistics', (req, res) => {
    const luid = req.body.luid;    

    if (!luid) {
        return res.status(400).json({ error: 'Missing required fields!' });
    }  
    
    
    pool.query('SELECT role FROM users WHERE ID=?', [luid], (error, results) => {
        if (error) {
            return res.status(500).json({ error: 'Database query error' });
        }

        if (results.length == 0) {
            return res.status(400).json({ error: 'User with this ID doesn\'t exist!' });
        }

        if (results[0].role != 'admin') {
            return res.status(403).json({ error: 'You don\'t have permission to get statistics!' });
        }  

        //adatok (Összes user, Összes belépés és a Top 3 aktív user)
       
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM users) AS totalUsers,
                (SELECT COALESCE(SUM(loginCount), 0) FROM users) AS totalLogins;
            SELECT 
                name,
                email,
                loginCount
            FROM users
            ORDER BY loginCount DESC
            LIMIT 3;
        `;

                pool.query(query, (error, dbResults) => {
            if (error) {
                console.error(error);
                return res.status(500).json({ error: 'Database query error during stats' });
            }

            
            const statistics = {
                totalUsers: dbResults[0][0].totalUsers,
                totalLogins: dbResults[0][0].totalLogins,
                topUsers: dbResults[1] // Ez a második SELECT eredménye (a top 3 tömbje)
            };

            return res.status(200).json(statistics);
        });

    });   
});

app.post('/api/admin/forecasts', (req, res) => {
    const { luid } = req.body;
    
    pool.query('SELECT role FROM users WHERE ID = ?', [luid], (error, results) => {
        if (error || results.length === 0 || results[0].role !== 'admin') {
            return res.status(403).json({ message: 'Hozzáférés megtagadva!' });
        }
        
        pool.query('SELECT * FROM weather_forecasts ORDER BY date DESC, location ASC', (err, forecasts) => {
            if (err) return res.status(500).json({ message: 'Adatbázis hiba!' });
            return res.status(200).json(forecasts);
        });
    });
});

// Új előrejelzés hozzáadása
app.post('/api/admin/forecasts/add', (req, res) => {
    const { luid, date, location, temp_min, temp_max, weather_type, precipitation, precipitation_probability, wind_speed, wind_direction, humidity, pressure, uv_index } = req.body;

    pool.query('SELECT role FROM users WHERE ID = ?', [luid], (error, results) => {
        if (error || results.length === 0 || results[0].role !== 'admin') return res.status(403).json({ message: 'Nincs jogod hozzá!' });

        const query = `INSERT INTO weather_forecasts 
            (date, location, temp_min, temp_max, weather_type, precipitation, precipitation_probability, wind_speed, wind_direction, humidity, pressure, uv_index, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;

        pool.query(query, [date, location, temp_min, temp_max, weather_type, precipitation, precipitation_probability, wind_speed, wind_direction, humidity, pressure, uv_index], (err) => {
            if (err) return res.status(500).json({ message: 'Mentési hiba!' });
            return res.status(201).json({ message: 'Előrejelzés sikeresen hozzáadva!' });
        });
    });
});

//  Előrejelzés módosítása
app.put('/api/admin/forecasts/update/:id', (req, res) => {
    const id = req.params.id;
    const { luid, date, location, temp_min, temp_max, weather_type, precipitation, precipitation_probability, wind_speed, wind_direction, humidity, pressure, uv_index } = req.body;

    pool.query('SELECT role FROM users WHERE ID = ?', [luid], (error, results) => {
        if (error || results.length === 0 || results[0].role !== 'admin') return res.status(403).json({ message: 'Nincs jogod hozzá!' });

        const query = `UPDATE weather_forecasts SET 
            date=?, location=?, temp_min=?, temp_max=?, weather_type=?, precipitation=?, 
            precipitation_probability=?, wind_speed=?, wind_direction=?, humidity=?, pressure=?, uv_index=?, updated_at=NOW() 
            WHERE ID=?`;

        pool.query(query, [date, location, temp_min, temp_max, weather_type, precipitation, precipitation_probability, wind_speed, wind_direction, humidity, pressure, uv_index, id], (err) => {
            if (err) return res.status(500).json({ message: 'Módosítási hiba!' });
            return res.status(200).json({ message: 'Előrejelzés sikeresen frissítve!' });
        });
    });
});

//  Előrejelzés törlése
app.delete('/api/admin/forecasts/delete/:id', (req, res) => {
    const id = req.params.id;
    const { luid } = req.body;

    pool.query('SELECT role FROM users WHERE ID = ?', [luid], (error, results) => {
        if (error || results.length === 0 || results[0].role !== 'admin') return res.status(403).json({ message: 'Nincs jogod hozzá!' });

        pool.query('DELETE FROM weather_forecasts WHERE ID = ?', [id], (err) => {
            if (err) return res.status(500).json({ message: 'Törlési hiba!' });
            return res.status(200).json({ message: 'Előrejelzés sikeresen törölve!' });
        });
    });
});

