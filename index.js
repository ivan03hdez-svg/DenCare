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

// Función de hash
async function hashPassword(password) {
    return await bcrypt.hash(password, saltRounds);
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
        Nombre,
        APaterno,
        AMaterno,
        GeneroId,
        FecNac,
        Telefono,
        Email,
        RolId,
        User,
        Password
    } = req.body;
    //Verificar si ya existe el usuario
    const sqlCheckUsuario = 'SELECT u.Usuario_User FROM Tbl_Usuarios u WHERE u.Usuario_User = ?';
    db.query(sqlCheckUsuario, [User], async (error, results) => {
        if (results.length > 0) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }
        
        db.beginTransaction(async (err) => {
            if(err){
                return res.status(500).json({error: 'Error al iniciar la Transaccion'})
            }
            const sqlPersona = `INSERT INTO Tbl_Persona (Persona_Nombre, Persona_APaterno, Persona_AMaterno, Persona_GeneroId, Persona_FecNac, Persona_Telefono, Persona_Email, Persona_RolId, Persona_Status) 
                                VALUES (?,?,?,?,?,?,?,?,1)`;
            db.query(sqlPersona, [Nombre,APaterno,AMaterno,GeneroId,FecNac,Telefono,Email,RolId], async (error, results) => {
                if(error){
                    return db.rollback(() => {
                        res.status(500).json({ error: 'Error al registrar la persona' });
                    });
                }
                const IdPersona = results.insertId;
                try{
                    const hashedPassword = await hashPassword(Password);
                    const sqlUsuario = `INSERT INTO Tbl_Usuarios (Usuario_PersonaId, Usuario_User, Usuario_Password) VALUES (?, ?, ?)`;
                    db.query(sqlUsuario, [IdPersona, User, hashedPassword], (error) => {
                        if (error) {
                            return db.rollback(() => { 
                                res.status(500).json({ error: 'Error al registrar el usuario' }); 
                            });
                        }
                        db.commit((err) => {
                            if (err) {
                                return db.rollback(() => { res.status(500).json({ error: 'Error al confirmar la transacción' }); });
                            }
                            res.json({ success: true, message: 'Usuario registrado exitosamente' });
                        });
                    });
                } catch (hashError) {
                    return db.rollback(() => {
                        res.status(500).json({ error: 'Error al hashear la contraseña' });
                    });
                }
            });
        });
    });
});

app.post('/Login', async (req, res) => {
    const { Usuario_User, Usuario_Password } = req.body;
    const query = `SELECT p.PersonaId, u.Usuario_PersonaId, u.Usuario_Password, p.Persona_Nombre, ct.Rol_Nombre FROM Tbl_Usuarios u INNER JOIN Tbl_Persona p 
                    ON u.Usuario_PersonaId = p.PersonaId INNER JOIN Tbl_Cat_Rol ct ON ct.RolId = p.Persona_RolId WHERE Usuario_User = ?`;
    db.query(query, [Usuario_User], async (err, results) => {
        if (err) {
            console.error('Error al realizar la consulta de login:', err);
            return res.status(500).json({ error: 'Error al procesar la solicitud' });
        }
        //Si el usuario no existe
        if (results.length === 0) {
            return res.status(400).json({ error: 'Usuario no encontrado' });
        }
        const user = results[0];
        // Comparamos la contraseña ingresada con la almacenada
        const isMatch = await bcrypt.compare(Usuario_Password, user.Usuario_Password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        // Si todo es correcto, devolvemos la información del usuario
        res.json({
            success: true,
            PersonaId: user.PersonaId,
            Nombre: user.Persona_Nombre,
            Rol: user.Rol_Nombre
        });
    });
});

app.get('/obtenerUsuarios', (req,res) =>{
    const query = `SELECT 
                    CONCAT(p.Persona_Nombre,' ',p.Persona_APaterno,' ',p.Persona_AMaterno) AS Nombre, 
                    g.Genero_Nombre AS Genero, 
                    DATE_FORMAT(Persona_FecNac, '%d-%m-%Y') AS Nacimiento,
                    p.Persona_Telefono AS Telefono,
                    p.Persona_Email AS Correo,
                    u.Usuario_User AS Usuario,
                    r.Rol_Nombre AS Tipo
                    FROM Tbl_Persona p INNER JOIN Tbl_Usuarios u ON p.PersonaId = u.Usuario_PersonaId
                    INNER JOIN Tbl_Cat_Generos g ON p.Persona_GeneroId = GeneroId
                    INNER JOIN Tbl_Cat_Rol r ON p.Persona_RolId = RolId;`;
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

app.get('/obtenerUsuariosById/:id', (req, res) => {
    const usuarioId = req.params.id; // Obtener el ID desde los parámetros de la URL
    const query = `SELECT p.Persona_Nombre AS Nombre, CONCAT(p.Persona_APaterno,' ', p.Persona_AMaterno) AS Apellido, g.Genero_Nombre AS Genero, p.Persona_FecNac AS 'Fecha Nacimiento',
                    p.Persona_Telefono AS Telefono, p.Persona_Email AS Correo, u.Usuario_User AS Usuario, u.Usuario_Password AS Contraseña 
                    FROM Tbl_Persona p INNER JOIN Tbl_Usuarios u ON u.Usuario_PersonaId = p.PersonaId INNER JOIN Tbl_Cat_Generos g ON p.Persona_GeneroId = g.GeneroId
                    WHERE u.UsuarioId = ?`;
    db.query(query, [usuarioId], (err, results) => {
        if (err) {
            console.error('Error al obtener usuarios:', err);
            res.status(500).json({ error: 'Error al obtener usuarios' });
        } else if (results.length === 0) {
            res.status(404).json({ error: 'Usuario no encontrado' });
        } else {
            res.json(results);
        }
    });
});

app.post('/ModificarUsuario', async (req, res) =>{
    const {
        PersonaId,
        NewNombre,
        NewAPaterno,
        NewAMaterno,
        NewTelefono,
        NewCorreo,
        NewPassword,
    } = req.body;
    try{
        const hashedPass = await bcrypt.hash(NewPassword, saltRounds);
        db.beginTransaction(async (err) =>{
            const updatePersona = `UPDATE Tbl_Persona SET Persona_Nombre = ?, Persona_APaterno = ?, Persona_AMaterno = ?, Persona_Telefono = ?, Persona_Email = ? 
                                    WHERE PersonaId = ?`;
            db.query(updatePersona, [NewNombre, NewAPaterno, NewAMaterno, NewTelefono, NewCorreo, PersonaId], async (err, results) => {
            if(err){
                return db.rollback(() => {
                    res.status(500).json({ error: 'Error al registrar la persona' });
                });
            }

            const updateUser = `UPDATE Tbl_Usuarios SET Usuario_Password = ? WHERE UsuarioId = ?`;
            db.query(updateUser, [hashedPass,PersonaId], async (err, results) => {
                if(err){
                    return db.rollback(() => {
                        res.status(500).json({ error: 'Error al registrar la persona' });
                    });
                }
                db.commit((err) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ error: 'Error al confirmar la transacción' });
                        });
                    }
                    res.status(200).json({ message: 'Datos actualizados exitosamente.' });
                });
            });


            });
        });
    }catch(hashError){
        res.status(500).send({ error: "Error al actualizar la contraseña"})
    }
});

//GENERAR CITA
app.post('/generarCita', async (req, res) =>{
    const {
        usuarioId,
        medicoId,
        fecha,
        hora,
        motivo,
        estadoId
    } = req.body;

    const Cita = `INSERT INTO Tbl_Citas (Cita_PacienteId, Cita_MedicoId, Cita_Fecha, Cita_Hora, Cita_Motivo, Cita_EstadoId) VALUES (?,?,?,?,?,?)`;
    db.query(Cita, [usuarioId, medicoId, fecha, hora, motivo, estadoId], async (error, results) => {
        if(error){
            return db.rollback(() => { res.status(500).json({ error: 'Error al ralizar la cita' }); });
        }
        res.status(200).json({ success: true, message: 'Cita realizada' })
    });
});
//CHAT
//

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