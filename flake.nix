{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };
  outputs = {
    nixpkgs,
    flake-utils,
    rust-overlay,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [(import rust-overlay)];
      pkgs = import nixpkgs {
        inherit system overlays;
      };
      rust-bin = pkgs.rust-bin.selectLatestNightlyWith (toolchain:
        toolchain.default.override {
          extensions = ["rust-src" "rust-analyzer"];
          targets = ["wasm32-unknown-unknown"];
        });
    in {
      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          rust-bin
          leptosfmt
          vscode-langservers-extracted
          trunk
        ];

        RUSTFLAGS = "--cfg=web_sys_unstable_apis";
      };
    });
}
