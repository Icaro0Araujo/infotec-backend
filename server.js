const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'infotec-chave-secreta',
    resave: false,
    saveUninitialized: true
}));

const conexao = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

conexao.connect((erro) => {
    if (erro) {
        console.log("Erro na conexão com o banco:", erro);
        return;
    }
    console.log("Banco de dados Aiven conectado!");
});

function checarLogin(req, res, next) {
    if (req.session && req.session.usuarioLogado) {
        return next();
    }
    res.send(`
        <script>
            alert('Acesso negado! Faça login primeiro.');
            window.location.href = '/login';
        </script>
    `);
}

app.get('/', (req, res) => {
    const sql = "SELECT * FROM produto";
    conexao.query(sql, (erro, produtos) => {
        if (erro) return res.send("Erro ao carregar catálogo.");

        let cards = '';
        produtos.forEach(p => {
            cards += `
                <div class="col-md-4 mb-4">
                    <div class="card h-100 shadow-sm border-0">
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title">${p.nome}</h5>
                            <p class="card-text text-muted">Estoque disponível: ${p.estoque} un.</p>
                            <h4 class="text-primary mt-auto">R$ ${Number(p.preco).toFixed(2)}</h4>
                            <button class="btn btn-outline-primary btn-sm mt-2">Adicionar ao Carrinho</button>
                        </div>
                    </div>
                </div>
            `;
        });

        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>InfoTec Hardware - Loja</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            </head>
            <body class="bg-light">
                <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
                    <div class="container">
                        <a class="navbar-brand fw-bold" href="/">InfoTec Hardware</a>
                        <div>
                            <a href="/login" class="btn btn-outline-light btn-sm me-2">Área Restrita / Login</a>
                            <a href="/cadastro" class="btn btn-primary btn-sm">Cadastrar</a>
                        </div>
                    </div>
                </nav>

                <div class="bg-dark text-white text-center py-5 mb-4" style="background: linear-gradient(135deg, #0d6efd 0%, #000 100%);">
                    <div class="container">
                        <h1 class="display-4 fw-bold">Peças e Periféricos de Alta Performance</h1>
                        <p class="lead">Os melhores componentes para o seu setup de informática.</p>
                    </div>
                </div>

                <div class="container">
                    <h3 class="mb-4">Catálogo de Produtos</h3>
                    <div class="row">
                        ${cards.length > 0 ? cards : '<div class="col-12"><div class="alert alert-info">Nenhum produto cadastrado no momento.</div></div>'}
                    </div>
                </div>

                <footer class="bg-dark text-white text-center py-3 mt-5">
                    <small>InfoTec &copy; - Desenvolvido para a disciplina de Desenvolvimento Web Backend</small>
                </footer>
            </body>
            </html>
        `;
        res.send(html);
    });
});

app.get('/cadastro', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'cadastro.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;
    try {
        const hash = await bcrypt.hash(senha, 10);
        const sql = "INSERT INTO cliente (nome, email, senha) VALUES (?, ?, ?)";
        conexao.query(sql, [nome, email, hash], (erro) => {
            if (erro) {
                return res.send(`
                    <script>
                        alert('Erro ao cadastrar. E-mail já existe.');
                        window.location.href = '/cadastro';
                    </script>
                `);
            }
            res.send(`
                <script>
                    alert('Cadastro realizado com sucesso!');
                    window.location.href = '/login';
                </script>
            `);
        });
    } catch (e) {
        res.send("Erro interno no servidor.");
    }
});

app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    const sql = "SELECT * FROM cliente WHERE email = ?";
    conexao.query(sql, [email], async (erro, resultados) => {
        if (erro) throw erro;
        if (resultados.length === 0) {
            return res.send(`
                <script>
                    alert('E-mail não encontrado!');
                    window.location.href = '/login';
                </script>
            `);
        }

        const usuario = resultados[0];
        const bateu = await bcrypt.compare(senha, usuario.senha);

        if (bateu) {
            req.session.usuarioLogado = { id: usuario.id_cliente, nome: usuario.nome };
            res.redirect('/painel');
        } else {
            res.send(`
                <script>
                    alert('Senha incorreta!');
                    window.location.href = '/login';
                </script>
            `);
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.get('/painel', checarLogin, (req, res) => {
    const sql = "SELECT * FROM produto";
    conexao.query(sql, (erro, produtos) => {
        if (erro) return res.send("Erro ao carregar o painel.");

        let linhasTabela = '';
        produtos.forEach(p => {
            linhasTabela += `
                <tr>
                    <td>${p.id_produto}</td>
                    <td>${p.nome}</td>
                    <td>R$ ${Number(p.preco).toFixed(2)}</td>
                    <td>${p.estoque} un.</td>
                    <td>
                        <a href="/produtos/deletar/${p.id_produto}" class="btn btn-danger btn-sm" onclick="return confirm('Tem certeza que deseja excluir?')">Excluir</a>
                    </td>
                </tr>
            `;
        });

        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>InfoTec - Painel Restrito</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            </head>
            <body class="bg-light">
                <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
                    <div class="container">
                        <a class="navbar-brand fw-bold" href="/painel">InfoTec Admin</a>
                        <div>
                            <a href="/" class="btn btn-outline-light btn-sm me-2" target="_blank">Ver Loja</a>
                            <a href="/logout" class="btn btn-danger btn-sm">Sair</a>
                        </div>
                    </div>
                </nav>

                <div class="container my-4">
                    <div class="row">
                        <div class="col-md-4 mb-4">
                            <div class="card shadow-sm border-0">
                                <div class="card-body">
                                    <h5 class="card-title mb-3">Novo Produto</h5>
                                    <form action="/produtos/novo" method="POST">
                                        <div class="mb-3">
                                            <label class="form-label">Nome do Produto</label>
                                            <input type="text" name="nome" class="form-control" placeholder="Ex: Teclado Mecânico" required>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Preço (R$)</label>
                                            <input type="number" step="0.01" name="preco" class="form-control" placeholder="0.00" required>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">Quantidade em Estoque</label>
                                            <input type="number" name="estoque" class="form-control" placeholder="0" required>
                                        </div>
                                        <button type="submit" class="btn btn-primary w-100">Cadastrar Produto</button>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <div class="col-md-8">
                            <div class="card shadow-sm border-0">
                                <div class="card-body">
                                    <h5 class="card-title mb-3">Estoque Atual</h5>
                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle">
                                            <thead class="table-dark">
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Produto</th>
                                                    <th>Preço</th>
                                                    <th>Estoque</th>
                                                    <th>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${linhasTabela.length > 0 ? linhasTabela : '<tr><td colspan="5" class="text-center text-muted">Nenhum produto cadastrado.</td></tr>'}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    });
});

app.post('/produtos/novo', checarLogin, (req, res) => {
    const { nome, preco, estoque } = req.body;
    const sql = "INSERT INTO produto (nome, preco, estoque) VALUES (?, ?, ?)";
    conexao.query(sql, [nome, preco, estoque], (erro) => {
        if (erro) return res.send("Erro ao cadastrar produto.");
        res.redirect('/painel');
    });
});

app.get('/produtos/deletar/:id', checarLogin, (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM produto WHERE id_produto = ?";
    conexao.query(sql, [id], (erro) => {
        if (erro) return res.send("Erro ao excluir produto.");
        res.redirect('/painel');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});