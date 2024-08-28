local lspconfig = require("lspconfig")
lspconfig.cssmodules_ls.setup({
    cmd = { "npx", "cssmodules-language-server" },
})
