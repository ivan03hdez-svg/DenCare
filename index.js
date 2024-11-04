const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');

//Instancia de Express
const app = express();
const saltRounds = 10;
const PORT = process.env.PORT || 3000;

//Permitir la interpretacion de JSON en las solicitudes
app.use(express.json());

//mysql://root:qtVcwAfqztQfpeMLIEQmxlJFcHMojlRK@autorack.proxy.rlwy.net:38940/railway

//Configuracion de la conexion a la BD
const db = mysql.createConnection({
    host: 'autorack.proxy.rlwy.net',
    user: 'root',
    password: 'qtVcwAfqztQfpeMLIEQmxlJFcHMojlRK',
    database: 'railway',
    port: 38940
});

//Funcion de Hasheo
async function hashPassword(password) {
    const hashedPass = await bcrypt.hash(password, saltRounds);
    return hashPassword;
}

//Conexion a la BD
db.connect((err) => {
    if(err){
        console.log('Error en la conexion: ' + err.stack);
        return;
    }else{
        console.log('Conexion Exitosa a la BD');
    }
});

app.get('/', (req, res) => {
    res.send('Bienvenido a la API');
});

//Ruta para agregar usuarios
app.post('/RegistroUsuarios', async (req, res) => {
    const {
        Persona_Nombre,
        Persona_APaterno,
        Persona_AMaterno,
        Persona_GeneroId,
        Persona_FecNac,
        Persona_Telefono,
        Persona_Email,
        Persona_RolId,
        Usuario_User,
        Usuario_Password        
    } = req.body;

    const sqlCheckUsuario = 'SELECT u.Usuario_User, u.Usuario_Password FROM Tbl_Usuarios WHERE Usuario_User = ? and Usuario_Password = ?';
    db.query(sqlCheckUsuario, [Usuario_User, Usuario_Password], (error, results) => {
        if (error) {
            return res.status(500).json({ error: 'Error al verificar el usuario' });
        }
        if (results.length > 0) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }
        db.beginTransaction((err) => {
            if(err){
                return res.status(500).json({error: 'Error al iniciar la Transaccion'})
            }
            const sqlPersona = `INSERT INTO Tbl_Persona (Persona_Nombre, Persona_APaterno, Persona_AMaterno, Persona_GeneroId, Persona_FecNac, Persona_Telefono, Persona_Email, Persona_RolId, Persona_Status) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`;
            db.query(sqlPersona, [Persona_Nombre, Persona_APaterno, Persona_AMaterno, Persona_GeneroId, Persona_FecNac, Persona_Telefono, Persona_Email, Persona_RolId], (error, results) => {
                if(error){
                    res.send(error);
                    return db.rollback(() => { res.status(500).json({ error: 'Error al registrar la persona'}); });
                }
                const IdPersona = results.insertId;
                try{
                    const hashPassword = bcrypt.hash(Usuario_Password, saltRounds);
                    const sqlUsuario = `INSERT INTO Tbl_Usuarios (Usuario_PersonaId, Usuario_User, Usuario_Password) VALUES (?, ?, ?)`;
                    db.query(sqlUsuario, [IdPersona, Usuario_User, hashPassword], (error) => {
                        if (error) {
                            return db.rollback(() => { res.status(500).json({ error: 'Error al registrar el usuario' }); });
                        }
                        db.commit((err) => {
                            if (err) {
                                return db.rollback(() => { res.status(500).json({ error: 'Error al confirmar la transacción' }); });
                            }
                            res.json({ success: true, message: 'Usuario registrado exitosamente' });
                        });
                    });
                }catch(hashError){
                    return db.rollback(() => {
                        res.status(500).json({ error: 'Error al hashear la contraseña' });
                    });
                }
            });
        });        
    });
});

app.get('/ObtenerUsuarios', (req,res) =>{
    const query = 'SELECT * FROM Tbl_Persona p INNER JOIN Tbl_Usuarios u ON p.PersonaId = u.Usuario_PersonaId; ';  
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener usuarios:', err);
            res.status(500).json({ error: 'Error al obtener usuarios' });
        } else {
            res.json(results);
            //res.send('Hola');
        }
    });
});


app.post('/Login', (req,res) => {
    const { 
        Usuario_User, 
        Usuario_Password 
    } = req.body;
    const query = `SELECT u.Usuario_PersonaId, p.Persona_Nombre, ct.Rol_Nombre FROM Tbl_Usuarios u INNER JOIN Tbl_Persona p ON u.Usuario_PersonaId = p.PersonaId 
                INNER JOIN Tbl_Cat_Rol ct On ct.RolId = p.Persona_RolId WHERE Usuario_User = ? and Usuario_Password = ?`;
    
});

//INICIAR EL SERVIDOR
app.listen(PORT, () =>{
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

//EVENTO PARA CERRAR LA CONEXION
process.on('SIGINT', () => {
    db.end((err) => {
        if(err){
            console.log('Error al cerrar la conexion; ' + err.stack);
        }
        console.log('Conexion Cerrada Correctamente');
        process.exit();
    });
});